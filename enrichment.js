import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import * as cheerio from 'cheerio';

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

        if (!this.anthropic) {
            console.warn('[Enrichment] WARNING: No Claude API key configured. Company enrichment will not work.');
        } else {
            console.log('[Enrichment] Company enricher initialized');
            console.log('[Enrichment] Scraping: Axios + Cheerio (fast HTML parsing)');
            console.log('[Enrichment] Structuring: Claude 3.5 Haiku (fast & cost-effective)');
        }
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
                console.log(`[Enrichment] No content fetched for ${domain}, trying SignalHire fallback`);

                // Try SignalHire as fallback
                if (this.signalHireApiKey) {
                    const signalHireData = await this.fetchFromSignalHire(domain, companyName);

                    if (signalHireData) {
                        console.log(`[Enrichment] ✓ Got company data from SignalHire for ${domain}`);
                        const enrichedData = this.parseSignalHireCompanyData(signalHireData, domain, companyName);
                        this.db.saveEnrichedData(domain, enrichedData);
                        return { status: 'completed', data: enrichedData, source: 'signalhire' };
                    }
                }

                // Final fallback: minimal data
                console.log(`[Enrichment] No data available from web or SignalHire for ${domain}`);
                const enrichedData = {
                    company_summary: `Unable to fetch website content for ${companyName}. Company may have anti-scraping protection (Cloudflare). Company information is based on job listing data only.`,
                    pages_scraped: [],
                    scrape_timestamp: new Date().toISOString(),
                    fetch_failed: true,
                    cloudflare_blocked: true
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
        console.log(`[Enrichment] Starting web scraping for ${domain}`);

        // Prioritize key pages only - homepage and about page
        const pagesToFetch = [
            `https://${domain}`,
            `https://www.${domain}`,
            `https://${domain}/about`,
            `https://www.${domain}/about`,
            `https://${domain}/about-us`,
            `https://${domain}/company`
        ];

        const results = {};

        // Fetch all URLs in parallel using axios with proper timeout
        const fetchPromises = pagesToFetch.map(async (url) => {
            try {
                const response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                    },
                    timeout: 10000, // 10 second timeout per request
                    maxRedirects: 5,
                    validateStatus: (status) => status === 200 // Only accept 200 OK
                });

                if (response.data) {
                    // Check for Cloudflare or bot protection
                    const html = response.data;
                    const isBlocked = this.isBlockedByProtection(html);

                    if (isBlocked) {
                        console.log(`[Enrichment] ✗ Bot protection detected on ${url} (Cloudflare/similar)`);
                        return; // Skip this URL
                    }

                    const extractedData = this.extractTextWithCheerio(html, url);

                    if (extractedData.text.length > 100) { // Only save if we got meaningful content
                        results[url] = extractedData;
                        console.log(`[Enrichment] ✓ Scraped ${url}: ${extractedData.text.length} chars, ${extractedData.headings.length} headings`);
                    }
                }
            } catch (error) {
                // Skip failed URLs silently - this is expected for many pages
                if (error.code === 'ECONNABORTED') {
                    console.log(`[Enrichment] ✗ Timeout: ${url}`);
                }
                // Silently skip other errors
            }
        });

        // Wait for all fetches to complete with a global timeout
        await Promise.race([
            Promise.allSettled(fetchPromises),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Global timeout')), 15000))
        ]).catch(() => {
            console.log(`[Enrichment] Global timeout reached for ${domain}`);
        });

        console.log(`[Enrichment] Scraping complete for ${domain}: ${Object.keys(results).length} pages fetched`);
        return results;
    }

    isBlockedByProtection(html) {
        // Check for common bot protection indicators
        const blockingIndicators = [
            /cloudflare/i,
            /cf-ray/i,
            /challenge-platform/i,
            /captcha/i,
            /bot protection/i,
            /access denied/i,
            /ddos-guard/i,
            /perimeterx/i,
            /datadome/i,
            /just a moment/i,
            /checking your browser/i,
            /security check/i
        ];

        return blockingIndicators.some(pattern => pattern.test(html));
    }

    extractTextWithCheerio(html, url) {
        const $ = cheerio.load(html);

        // Remove unwanted elements
        $('script, style, noscript, iframe, svg, nav, footer, header[role="banner"]').remove();

        // Extract metadata
        const title = $('title').text().trim();
        const metaDescription = $('meta[name="description"]').attr('content') || '';

        // Extract headings for structure
        const headings = [];
        $('h1, h2, h3').each((_, elem) => {
            const text = $(elem).text().trim();
            if (text && text.length < 200) {
                headings.push(text);
            }
        });

        // Extract main content
        // Priority: main tag, article tag, or body
        let mainContent = $('main, article, [role="main"]').first();
        if (mainContent.length === 0) {
            mainContent = $('body');
        }

        // Get text content with structure preserved
        let text = mainContent
            .find('p, li, h1, h2, h3, h4, span, div')
            .map((_, elem) => $(elem).text().trim())
            .get()
            .filter(text => text.length > 20 && text.length < 1000) // Filter out too short/long
            .join('\n')
            .replace(/\s+/g, ' ') // Normalize whitespace
            .replace(/\n\s*\n/g, '\n') // Remove multiple newlines
            .trim();

        // If we didn't get much content, fall back to body text
        if (text.length < 500) {
            text = $('body').text()
                .replace(/\s+/g, ' ')
                .trim();
        }

        // Limit content size
        text = text.substring(0, 30000);

        return {
            url: url,
            title: title,
            metaDescription: metaDescription,
            headings: headings.slice(0, 10), // Top 10 headings
            text: text
        };
    }

    // === SignalHire Fallback Methods ===

    async fetchFromSignalHire(domain, companyName) {
        if (!this.signalHireApiKey) {
            return null;
        }

        try {
            console.log(`[Enrichment] Fetching company data from SignalHire for ${companyName}`);

            const response = await axios.post('https://www.signalhire.com/api/v1/search/companies', {
                name: companyName,
                domain: domain,
                limit: 1
            }, {
                headers: {
                    'apikey': this.signalHireApiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 10000
            });

            if (response.data && response.data.items && response.data.items.length > 0) {
                return response.data.items[0];
            }

            return null;
        } catch (error) {
            console.error(`[Enrichment] SignalHire API error for ${domain}:`, error.message);
            return null;
        }
    }

    parseSignalHireCompanyData(signalHireData, domain, companyName) {
        const data = signalHireData;

        // Extract company information from SignalHire response
        const enrichedData = {
            company_summary: data.description || `${companyName} - Company data sourced from SignalHire.`,
            company_name: data.name || companyName,
            domain: domain,

            // Company details
            industry: data.industry || null,
            employee_count: data.size || data.employeeCount || null,
            location: data.location || data.headquarters || null,
            founded_year: data.foundedYear || null,

            // Social/Web presence
            linkedin_url: data.linkedinUrl || data.linkedin || null,
            twitter_url: data.twitterUrl || data.twitter || null,
            facebook_url: data.facebookUrl || data.facebook || null,

            // Additional metadata
            technologies: data.technologies || [],
            specialties: data.specialties || [],

            // Data source metadata
            data_source: 'signalhire',
            scrape_timestamp: new Date().toISOString(),
            pages_scraped: [],
            signalhire_data: data,

            // Note about data source
            note: 'Company data sourced from SignalHire due to website scraping protection (Cloudflare or similar).'
        };

        return enrichedData;
    }

    // Build the extraction prompt for Claude (using scraped data)
    buildExtractionPrompt(domain, companyName, websiteContent) {
        const contentSummary = Object.entries(websiteContent)
            .map(([url, data]) => {
                let summary = `=== ${url} ===\n`;
                if (data.title) summary += `Title: ${data.title}\n`;
                if (data.metaDescription) summary += `Meta: ${data.metaDescription}\n`;
                if (data.headings && data.headings.length > 0) {
                    summary += `Headings: ${data.headings.join(' | ')}\n`;
                }
                summary += `\nContent:\n${data.text}`;
                return summary;
            })
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

    // Rotate to next Gemini API key
    rotateGeminiKey() {
        if (this.geminiKeys.length <= 1) {
            console.log('[Enrichment] No other Gemini API keys to rotate to');
            return false;
        }

        this.currentGeminiKeyIndex = (this.currentGeminiKeyIndex + 1) % this.geminiKeys.length;
        const newKey = this.geminiKeys[this.currentGeminiKeyIndex];

        console.log(`[Enrichment] Rotating to Gemini API key ${this.currentGeminiKeyIndex + 1}/${this.geminiKeys.length}`);

        this.gemini = new GoogleGenerativeAI(newKey);
        this.geminiModel = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });

        return true;
    }

    // Use Claude Haiku for structuring scraped data (faster and cheaper)
    async extractWithAI(domain, companyName, websiteContent) {
        if (!this.anthropic) {
            throw new Error('Claude API key required for company enrichment');
        }

        console.log(`[Enrichment] Using Claude Haiku to structure scraped data for ${domain}`);
        return await this.extractWithClaude(domain, companyName, websiteContent);
    }

    // Extract using Google Gemini (with key rotation on failure)
    async extractWithGemini(domain, companyName, websiteContent) {
        const prompt = this.buildExtractionPrompt(domain, companyName, websiteContent);

        let lastError = null;
        const maxKeyAttempts = this.geminiKeys.length;

        for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
            try {
                const result = await this.geminiModel.generateContent(prompt);
                const response = await result.response;
                const responseText = response.text();

                return this.parseAIResponse(responseText, websiteContent);
            } catch (error) {
                lastError = error;

                // Check error type
                const isInvalidKeyError = error.message?.includes('API key') ||
                                        error.message?.includes('API_KEY_INVALID') ||
                                        error.status === 400;

                const isQuotaError = error.status === 429 ||
                                   error.message?.includes('quota') ||
                                   error.message?.includes('Too Many Requests');

                // Rotate on invalid key or quota error
                if ((isInvalidKeyError || isQuotaError) && attempt < maxKeyAttempts - 1) {
                    const errorType = isQuotaError ? 'quota exceeded' : 'invalid key';
                    console.log(`[Enrichment] Gemini ${errorType}, rotating to next key (attempt ${attempt + 1}/${maxKeyAttempts})`);
                    this.rotateGeminiKey();
                } else {
                    // Not a recoverable error or no more keys to try
                    if (isQuotaError && attempt === maxKeyAttempts - 1) {
                        console.log(`[Enrichment] All ${maxKeyAttempts} Gemini API keys have exceeded quota`);
                    }
                    break;
                }
            }
        }

        // All keys failed, throw the last error
        throw lastError;
    }

    // Extract using Anthropic Claude
    async extractWithClaude(domain, companyName, websiteContent) {
        const prompt = this.buildExtractionPrompt(domain, companyName, websiteContent);

        const response = await this.anthropic.messages.create({
            model: 'claude-3-5-haiku-20241022', // Use Haiku - faster and cheaper for structuring
            max_tokens: 4096,
            messages: [{
                role: 'user',
                content: prompt
            }]
        });

        const responseText = response.content[0].text;
        return this.parseAIResponse(responseText, websiteContent);
    }

    // Parse Claude response
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

            // Add metadata about scraping
            enrichedData.pages_scraped = Object.keys(websiteContent);
            enrichedData.scrape_timestamp = new Date().toISOString();
            enrichedData.ai_provider = 'claude-haiku';
            enrichedData.scraping_method = 'cheerio';

            return enrichedData;
        } catch (parseError) {
            console.error('[Enrichment] Failed to parse Claude response:', parseError.message);
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
