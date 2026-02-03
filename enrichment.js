import { GoogleGenerativeAI } from '@google/generative-ai';

const RETRY_CONFIG = {
    maxAttempts: 3,
    baseDelayMs: 5000,
    maxDelayMs: 60000,
    backoffMultiplier: 2
};

// SignalHire API configuration
const SIGNALHIRE_API_URL = 'https://www.signalhire.com/api/v1';

export class CompanyEnricher {
    constructor(options = {}) {
        const {
            anthropicClient = null,
            geminiApiKey = null,
            db,
            signalHireApiKey = null
        } = options;

        this.anthropic = anthropicClient;
        this.db = db;
        this.signalHireApiKey = signalHireApiKey || process.env.SIGNALHIRE_API_KEY;
        this.processingQueue = new Set();

        // Initialize Gemini if API key is provided
        const geminiKey = geminiApiKey || process.env.GEMINI_API_KEY;
        if (geminiKey) {
            this.gemini = new GoogleGenerativeAI(geminiKey);
            this.geminiModel = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
            console.log('[Enrichment] Gemini initialized - will use for content structuring');
        } else {
            this.gemini = null;
            this.geminiModel = null;
        }

        // Determine which AI to use for enrichment
        this.useGemini = !!this.geminiModel;
        console.log(`[Enrichment] Using ${this.useGemini ? 'Gemini' : 'Claude'} for company enrichment`);
    }

    async enrich(domain, companyName) {
        // Prevent duplicate processing
        if (this.processingQueue.has(domain)) {
            console.log(`[Enrichment] ${domain} already processing, skipping`);
            return { status: 'processing' };
        }

        this.processingQueue.add(domain);
        console.log(`[Enrichment] Starting enrichment for ${domain}`);

        try {
            // Update status to processing
            this.db.updateEnrichmentStatus(domain, 'processing');

            // Step 1: Fetch website content
            console.log(`[Enrichment] Fetching website content for ${domain}`);
            const websiteContent = await this.fetchWebsiteContent(domain);

            if (Object.keys(websiteContent).length === 0) {
                console.log(`[Enrichment] No content fetched for ${domain}, using fallback`);
                // Create minimal enriched data from existing info
                const enrichedData = {
                    company_summary: `Unable to fetch website content for ${companyName}. Company information is based on job listing data only.`,
                    pages_scraped: [],
                    scrape_timestamp: new Date().toISOString(),
                    fetch_failed: true
                };
                this.db.saveEnrichedData(domain, enrichedData);
                return { status: 'completed', data: enrichedData, partial: true };
            }

            // Step 2: Use AI to extract structured data (Gemini or Claude)
            console.log(`[Enrichment] Extracting data with ${this.useGemini ? 'Gemini' : 'Claude'} for ${domain}`);
            const enrichedData = await this.extractWithAI(domain, companyName, websiteContent);

            // Step 3: Save to database
            this.db.saveEnrichedData(domain, enrichedData);
            console.log(`[Enrichment] Successfully enriched ${domain}`);

            return { status: 'completed', data: enrichedData };

        } catch (error) {
            console.error(`[Enrichment] Error enriching ${domain}:`, error.message);
            this.db.recordEnrichmentError(domain, error.message);
            throw error;
        } finally {
            this.processingQueue.delete(domain);
        }
    }

    async enrichWithRetry(domain, companyName) {
        const company = this.db.getCompany(domain);
        const attempts = company?.enrichment_attempts || 0;

        if (attempts >= RETRY_CONFIG.maxAttempts) {
            console.log(`[Enrichment] Max retry attempts exceeded for ${domain}`);
            throw new Error(`Max retry attempts (${RETRY_CONFIG.maxAttempts}) exceeded`);
        }

        try {
            return await this.enrich(domain, companyName);
        } catch (error) {
            this.db.incrementAttempts(domain);

            const isRetryable = this.isRetryableError(error);

            if (isRetryable && attempts + 1 < RETRY_CONFIG.maxAttempts) {
                const delay = Math.min(
                    RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempts),
                    RETRY_CONFIG.maxDelayMs
                );

                console.log(`[Enrichment] Retrying ${domain} in ${delay}ms (attempt ${attempts + 2})`);

                setTimeout(() => {
                    this.enrichWithRetry(domain, companyName).catch(err => {
                        console.error(`[Enrichment] Retry failed for ${domain}:`, err.message);
                    });
                }, delay);

                return { status: 'retrying', nextAttemptIn: delay };
            }

            throw error;
        }
    }

    isRetryableError(error) {
        const retryablePatterns = [
            /timeout/i,
            /ECONNRESET/i,
            /ETIMEDOUT/i,
            /rate limit/i,
            /503/,
            /429/,
            /temporarily unavailable/i,
            /ENOTFOUND/i,
            /fetch failed/i
        ];

        return retryablePatterns.some(pattern => pattern.test(error.message));
    }

    async fetchWebsiteContent(domain) {
        const pagesToFetch = [
            `https://${domain}`,
            `https://${domain}/about`,
            `https://${domain}/about-us`,
            `https://${domain}/company`,
            `https://${domain}/team`,
            `https://${domain}/careers`,
            `https://${domain}/jobs`,
            `https://www.${domain}`,
            `https://www.${domain}/about`
        ];

        const results = {};
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000); // 30s total timeout

        for (const url of pagesToFetch) {
            try {
                const response = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.5',
                    },
                    signal: controller.signal,
                    redirect: 'follow'
                });

                if (response.ok) {
                    const html = await response.text();
                    const text = this.extractTextFromHtml(html);

                    if (text.length > 100) { // Only save if we got meaningful content
                        results[url] = {
                            status: response.status,
                            text: text.substring(0, 30000) // Limit content size
                        };
                        console.log(`[Enrichment] Fetched ${url}: ${text.length} chars`);
                    }
                }
            } catch (error) {
                // Skip failed URLs silently - this is expected for many pages
                if (error.name !== 'AbortError') {
                    // console.log(`[Enrichment] Failed to fetch ${url}: ${error.message}`);
                }
            }
        }

        clearTimeout(timeout);
        return results;
    }

    extractTextFromHtml(html) {
        // Remove scripts, styles, and other non-content elements
        let text = html
            // Remove script tags and content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
            // Remove style tags and content
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
            // Remove SVG tags and content
            .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
            // Remove nav elements
            .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, ' ')
            // Remove footer elements
            .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, ' ')
            // Remove header elements (but keep content headers h1-h6)
            .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, ' ')
            // Remove noscript
            .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
            // Remove HTML comments
            .replace(/<!--[\s\S]*?-->/g, ' ')
            // Convert br, p, div, li to newlines for better structure
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/?(p|div|li|h[1-6]|tr|section|article)[^>]*>/gi, '\n')
            // Remove all remaining HTML tags
            .replace(/<[^>]+>/g, ' ')
            // Decode common HTML entities
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&[a-z]+;/gi, ' ')
            // Clean up whitespace
            .replace(/\s+/g, ' ')
            .replace(/\n\s*\n/g, '\n')
            .trim();

        return text;
    }

    // Build the extraction prompt (shared between Gemini and Claude)
    buildExtractionPrompt(domain, companyName, websiteContent) {
        const contentSummary = Object.entries(websiteContent)
            .map(([url, data]) => `=== ${url} ===\n${data.text}`)
            .join('\n\n');

        // Truncate if too long (Gemini has larger context, but let's be consistent)
        const maxContentLength = 50000;
        const truncatedContent = contentSummary.length > maxContentLength
            ? contentSummary.substring(0, maxContentLength) + '\n\n[Content truncated...]'
            : contentSummary;

        return `Analyze the following website content for the company "${companyName}" (${domain}) and extract structured information.

Website Content:
${truncatedContent}

Extract and return a JSON object with the following structure. Use null for any fields you cannot determine from the content. Be thorough but only include information that is clearly stated or strongly implied in the content:

{
    "tagline": "Company tagline or mission statement (exact quote if available)",
    "description": "2-3 paragraph company description based on the content",
    "products": ["List of main products or services offered"],
    "founders": [{"name": "Name", "title": "Title", "linkedin_url": null}],
    "leadership_team": [{"name": "Name", "title": "Title"}],
    "business_model": "B2B, B2C, B2B2C, marketplace, SaaS, etc.",
    "target_market": "Who they serve / target customers",
    "customers": ["Notable customers if mentioned"],
    "culture_values": ["Company values if stated"],
    "benefits": ["Employee benefits if mentioned on careers page"],
    "remote_policy": "Remote work policy if mentioned",
    "tech_stack": ["Technologies mentioned"],
    "engineering_blog": "URL if found",
    "github_url": "URL if found",
    "social_links": {
        "twitter": "URL or null",
        "linkedin": "URL or null",
        "facebook": "URL or null"
    },
    "company_summary": "A concise 2-3 sentence summary of what the company does, their main product/service, and what makes them notable",
    "work_culture_assessment": "Based on available information, describe what working at this company might be like (tone, values, team structure, etc.)",
    "growth_signals": ["Signs of company growth or positive trajectory (funding, hiring, expansion, etc.)"],
    "red_flags": ["Any potential concerns or things a job seeker should investigate further"],

    "target_contacts": [
        {
            "name": "Full name of the person",
            "title": "Job title",
            "department": "Sales, Marketing, Engineering, etc.",
            "linkedin_url": "LinkedIn profile URL if found",
            "relevance": "Why this person is a good contact for GTM/sales engineering services",
            "priority": "high/medium/low - based on decision-making authority"
        }
    ],
    "recommended_outreach_roles": ["List of job titles/roles to target if specific names not found, e.g., 'VP of Sales', 'Head of Growth', 'CTO'"],
    "gtm_opportunity_assessment": "Assessment of whether this company could benefit from GTM engineering services - consider their stage, tech stack, hiring patterns, and growth signals"
}

Important guidelines:
- Only include information that is actually present or strongly implied in the content
- For red_flags, be balanced - note legitimate concerns but don't be alarmist
- For growth_signals, look for concrete evidence (funding announcements, team growth, new products, etc.)
- If the content is limited, acknowledge this in your assessment

SPECIAL FOCUS ON TARGET CONTACTS:
- For GTM (Go-To-Market) engineering services, the best contacts are typically:
  1. VP/Head of Sales, Revenue, or Growth (high priority)
  2. VP/Head of Marketing or Demand Generation (high priority)
  3. CRO (Chief Revenue Officer) (high priority)
  4. CEO/Founder (for smaller companies, high priority)
  5. VP/Head of Sales Operations or Revenue Operations (medium priority)
  6. VP/Head of Engineering or CTO (if they might influence tooling decisions, medium priority)
- Extract any names and titles you can find from the team/about/leadership pages
- Include LinkedIn URLs if visible on the website
- If no specific names are found, provide recommended_outreach_roles based on company size and structure

Return ONLY the JSON object, no additional text or markdown formatting.`;
    }

    // Wrapper method that chooses between Gemini and Claude
    async extractWithAI(domain, companyName, websiteContent) {
        if (this.useGemini && this.geminiModel) {
            return await this.extractWithGemini(domain, companyName, websiteContent);
        } else if (this.anthropic) {
            return await this.extractWithClaude(domain, companyName, websiteContent);
        } else {
            throw new Error('No AI provider configured (need either GEMINI_API_KEY or ANTHROPIC_API_KEY)');
        }
    }

    // Extract using Google Gemini
    async extractWithGemini(domain, companyName, websiteContent) {
        const prompt = this.buildExtractionPrompt(domain, companyName, websiteContent);

        const result = await this.geminiModel.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();

        return this.parseAIResponse(responseText, websiteContent);
    }

    // Extract using Anthropic Claude
    async extractWithClaude(domain, companyName, websiteContent) {
        const prompt = this.buildExtractionPrompt(domain, companyName, websiteContent);

        const response = await this.anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const responseText = response.content[0].text;
        return this.parseAIResponse(responseText, websiteContent);
    }

    // Parse AI response (shared between Gemini and Claude)
    parseAIResponse(responseText, websiteContent) {
        // Parse JSON from response
        try {
            // Handle potential markdown code blocks
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const enrichedData = JSON.parse(jsonStr);
            enrichedData.pages_scraped = Object.keys(websiteContent);
            enrichedData.scrape_timestamp = new Date().toISOString();
            enrichedData.ai_provider = this.useGemini ? 'gemini' : 'claude';

            return enrichedData;
        } catch (parseError) {
            console.error('[Enrichment] Failed to parse AI response:', parseError.message);
            console.error('[Enrichment] Response was:', responseText.substring(0, 500));
            throw new Error(`Failed to parse AI response: ${parseError.message}`);
        }
    }

    // === SignalHire Contact Enrichment Methods ===

    async enrichContactsWithSignalHire(contacts, companyDomain) {
        if (!this.signalHireApiKey) {
            console.log('[Enrichment] SignalHire API key not configured, skipping contact enrichment');
            return contacts.map(c => ({ ...c, contact_enriched: false }));
        }

        const enrichedContacts = [];

        for (const contact of contacts) {
            try {
                const enrichedContact = await this.lookupContactSignalHire(contact, companyDomain);
                enrichedContacts.push(enrichedContact);

                // Rate limiting - SignalHire has 600 requests/minute limit
                await this.delay(150);
            } catch (error) {
                console.error(`[Enrichment] Failed to enrich contact ${contact.name}:`, error.message);
                enrichedContacts.push({ ...contact, contact_enriched: false, enrichment_error: error.message });
            }
        }

        return enrichedContacts;
    }

    async lookupContactSignalHire(contact, companyDomain) {
        if (!this.signalHireApiKey) {
            return { ...contact, contact_enriched: false };
        }

        // Try LinkedIn URL first if available
        if (contact.linkedin_url) {
            const result = await this.signalHirePersonLookup({ linkedin_url: contact.linkedin_url });
            if (result) {
                return { ...contact, ...result, contact_enriched: true };
            }
        }

        // Fall back to name + company search
        if (contact.name) {
            const result = await this.signalHireSearch({
                name: contact.name,
                company: companyDomain,
                title: contact.title
            });
            if (result) {
                return { ...contact, ...result, contact_enriched: true };
            }
        }

        return { ...contact, contact_enriched: false };
    }

    async signalHirePersonLookup(params) {
        try {
            const queryParams = new URLSearchParams();
            if (params.linkedin_url) queryParams.set('url', params.linkedin_url);
            if (params.email) queryParams.set('email', params.email);

            const response = await fetch(`${SIGNALHIRE_API_URL}/candidate/search?${queryParams}`, {
                method: 'GET',
                headers: {
                    'apikey': this.signalHireApiKey,
                    'Accept': 'application/json'
                }
            });

            if (response.status === 200) {
                const data = await response.json();
                return this.parseSignalHireResponse(data);
            } else if (response.status === 201) {
                // Request accepted, need to poll for results
                const requestId = response.headers.get('X-Request-Id');
                return await this.pollSignalHireResult(requestId);
            }

            return null;
        } catch (error) {
            console.error('[SignalHire] Lookup error:', error.message);
            return null;
        }
    }

    async signalHireSearch(params) {
        try {
            const response = await fetch(`${SIGNALHIRE_API_URL}/search`, {
                method: 'POST',
                headers: {
                    'apikey': this.signalHireApiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    fullName: params.name,
                    currentEmployer: params.company,
                    currentTitle: params.title,
                    limit: 1
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.items && data.items.length > 0) {
                    return this.parseSignalHireSearchResult(data.items[0]);
                }
            }

            return null;
        } catch (error) {
            console.error('[SignalHire] Search error:', error.message);
            return null;
        }
    }

    async pollSignalHireResult(requestId, maxAttempts = 10) {
        for (let i = 0; i < maxAttempts; i++) {
            await this.delay(2000); // Wait 2 seconds between polls

            try {
                const response = await fetch(`${SIGNALHIRE_API_URL}/candidate/request/${requestId}`, {
                    method: 'GET',
                    headers: {
                        'apikey': this.signalHireApiKey,
                        'Accept': 'application/json'
                    }
                });

                if (response.status === 200) {
                    const data = await response.json();
                    return this.parseSignalHireResponse(data);
                } else if (response.status === 204) {
                    // Still processing, continue polling
                    continue;
                } else {
                    break;
                }
            } catch (error) {
                console.error('[SignalHire] Poll error:', error.message);
                break;
            }
        }

        return null;
    }

    parseSignalHireResponse(data) {
        if (!data) return null;

        return {
            email: data.emails?.[0]?.email || null,
            email_verified: data.emails?.[0]?.verified || false,
            phone: data.phones?.[0]?.phone || null,
            phone_type: data.phones?.[0]?.type || null,
            linkedin_url: data.linkedin || null,
            location: data.location || null,
            current_company: data.currentEmployer || null,
            current_title: data.currentTitle || null,
            profile_photo: data.photo || null,
            signalhire_id: data.id || null
        };
    }

    parseSignalHireSearchResult(item) {
        if (!item) return null;

        return {
            signalhire_id: item.id || null,
            linkedin_url: item.linkedin || null,
            location: item.location || null,
            current_company: item.currentEmployer || null,
            current_title: item.currentTitle || null,
            profile_photo: item.photo || null,
            // Note: Search results don't include contact info, need to do a separate lookup
            needs_full_lookup: true
        };
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Method to enrich contacts for a specific company (can be called separately)
    async enrichCompanyContacts(domain) {
        const company = this.db.getCompany(domain);
        if (!company || !company.enriched_data) {
            throw new Error('Company not found or not enriched');
        }

        const contacts = company.enriched_data.target_contacts || [];
        if (contacts.length === 0) {
            console.log(`[Enrichment] No contacts to enrich for ${domain}`);
            return [];
        }

        console.log(`[Enrichment] Enriching ${contacts.length} contacts for ${domain}`);
        const enrichedContacts = await this.enrichContactsWithSignalHire(contacts, domain);

        // Update the company record with enriched contacts
        const updatedEnrichedData = {
            ...company.enriched_data,
            target_contacts: enrichedContacts,
            contacts_enriched_at: new Date().toISOString()
        };

        this.db.saveEnrichedData(domain, updatedEnrichedData);
        console.log(`[Enrichment] Contact enrichment completed for ${domain}`);

        return enrichedContacts;
    }
}
