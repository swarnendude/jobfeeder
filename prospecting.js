import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

const SIGNALHIRE_SEARCH_URL = 'https://www.signalhire.com/api/v1/search/people';

/**
 * Prospecting service for finding and analyzing potential contacts
 */
export class ProspectingService {
    constructor(options = {}) {
        const {
            anthropicClient = null,
            signalHireApiKey = null,
            db
        } = options;

        this.anthropic = anthropicClient;
        this.signalHireApiKey = signalHireApiKey;
        this.db = db;
    }

    /**
     * Start prospecting for a company
     */
    async startProspecting(companyDomain, jobData = null) {
        console.log(`[Prospecting] Starting prospecting for ${companyDomain}`);

        // Get company data
        const company = await this.db.getCompany(companyDomain);
        if (!company) {
            throw new Error('Company not found');
        }

        const enrichedData = company.enriched_data || {};
        const theirstackData = company.theirstack_data || {};

        // Determine search parameters
        const searchParams = this.buildSearchParams(company, enrichedData, theirstackData, jobData);

        // Search SignalHire for prospects
        const signalHireResults = await this.searchSignalHire(searchParams);

        if (!signalHireResults || signalHireResults.length === 0) {
            console.log(`[Prospecting] No prospects found for ${companyDomain}`);
            return {
                prospects: [],
                total_found: 0,
                message: 'No prospects found matching the criteria'
            };
        }

        console.log(`[Prospecting] Found ${signalHireResults.length} prospects, analyzing with Claude...`);

        // Analyze with Claude to select best prospects
        const selectedProspects = await this.analyzeProspectsWithClaude(
            company,
            enrichedData,
            jobData,
            signalHireResults
        );

        // Save prospects to database
        const savedProspects = await this.saveProspects(company.id, selectedProspects, signalHireResults);

        console.log(`[Prospecting] Saved ${savedProspects.length} prospects for ${companyDomain}`);

        return {
            prospects: savedProspects,
            total_found: signalHireResults.length,
            message: `Found ${signalHireResults.length} prospects, selected top ${savedProspects.length}`
        };
    }

    /**
     * Build search parameters for SignalHire
     */
    buildSearchParams(company, enrichedData, theirstackData, jobData) {
        const params = {
            company: company.name,
            limit: 20
        };

        // Determine target roles based on job title and company size
        const targetRoles = [];
        const companySize = theirstackData.employee_count || 100;

        // Default to GTM/Sales/Marketing roles
        if (companySize < 50) {
            targetRoles.push('Founder', 'CEO', 'Co-Founder');
        }

        if (companySize >= 50) {
            targetRoles.push(
                'VP Sales', 'VP Marketing', 'VP Revenue', 'VP Growth',
                'Head of Sales', 'Head of Marketing', 'Head of Revenue',
                'Chief Revenue Officer', 'CRO', 'VP of Sales', 'VP of Marketing'
            );
        }

        if (companySize >= 200) {
            targetRoles.push(
                'Director of Sales', 'Director of Marketing',
                'Sales Director', 'Marketing Director'
            );
        }

        params.titles = targetRoles;

        // Add location filter if available from job data
        if (jobData && jobData.country) {
            params.country = jobData.country;
        }

        return params;
    }

    /**
     * Search SignalHire for prospects
     */
    async searchSignalHire(searchParams) {
        if (!this.signalHireApiKey) {
            console.log('[Prospecting] SignalHire API key not configured');
            return [];
        }

        try {
            console.log(`[Prospecting] SignalHire search:`, searchParams);

            const response = await axios.post(SIGNALHIRE_SEARCH_URL, searchParams, {
                headers: {
                    'apikey': this.signalHireApiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: 15000,
                validateStatus: (status) => status >= 200 && status < 300
            });

            const data = response.data;

            if (data.items && data.items.length > 0) {
                return data.items.map(item => ({
                    signalhire_id: item.id || null,
                    name: item.fullName || item.name || 'Unknown',
                    title: item.currentTitle || item.title || '',
                    company: item.company || searchParams.company,
                    linkedin_url: item.linkedin || null,
                    location: item.location || null,
                    photo: item.photo || null,
                    raw_data: item
                }));
            }

            return [];
        } catch (error) {
            if (error.response) {
                console.error(`[Prospecting] SignalHire API error: ${error.response.status} - ${error.response.data}`);
            } else {
                console.error('[Prospecting] SignalHire search error:', error.message);
            }
            return [];
        }
    }

    /**
     * Analyze prospects with Claude to select the best 2-3
     */
    async analyzeProspectsWithClaude(company, enrichedData, jobData, prospects) {
        if (!this.anthropic) {
            console.log('[Prospecting] Claude not configured, returning all prospects');
            return prospects.slice(0, 3).map((p, i) => ({
                ...p,
                priority: i === 0 ? 'high' : 'medium',
                ai_score: 1.0 - (i * 0.1),
                relevance: 'Selected by default'
            }));
        }

        try {
            const prompt = this.buildAnalysisPrompt(company, enrichedData, jobData, prospects);

            const response = await this.anthropic.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 2048,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            });

            const responseText = response.content[0].text;
            const analysis = this.parseAnalysisResponse(responseText, prospects);

            return analysis;
        } catch (error) {
            console.error('[Prospecting] Claude analysis error:', error);
            // Fallback: return top 3 by title priority
            return prospects.slice(0, 3).map((p, i) => ({
                ...p,
                priority: i === 0 ? 'high' : 'medium',
                ai_score: 1.0 - (i * 0.1),
                relevance: 'Selected by fallback logic'
            }));
        }
    }

    /**
     * Build prompt for Claude analysis
     */
    buildAnalysisPrompt(company, enrichedData, jobData, prospects) {
        return `You are analyzing potential contacts at ${company.name} for a GTM (Go-To-Market) engineering/platform opportunity.

COMPANY INFORMATION:
- Company: ${company.name}
- Domain: ${company.domain}
${enrichedData.company_summary ? `- Summary: ${enrichedData.company_summary}` : ''}
${enrichedData.technologies ? `- Technologies: ${enrichedData.technologies.join(', ')}` : ''}
${enrichedData.growth_signals ? `- Growth Signals: ${enrichedData.growth_signals.join('; ')}` : ''}

JOB CONTEXT:
${jobData ? `- Job Title: ${jobData.job_title}
- Location: ${jobData.location || 'Not specified'}` : 'This is for general GTM/Sales/Marketing platform outreach'}

FOUND PROSPECTS (${prospects.length} total):
${prospects.map((p, i) => `${i + 1}. ${p.name} - ${p.title}${p.location ? ` (${p.location})` : ''}`).join('\n')}

TASK:
Analyze these prospects and select the TOP 2-3 people who would be the BEST fit for discussing GTM engineering/platform solutions.

SELECTION CRITERIA:
1. Decision-making authority for GTM tools/platforms
2. Title relevance (VP/Head/Director of Sales, Marketing, Revenue, Growth)
3. Seniority level appropriate for partnership discussions
4. Department alignment with GTM needs

For each selected prospect, provide:
- prospect_index: The number (1-${prospects.length}) of the prospect from the list above
- priority: "high", "medium", or "low"
- ai_score: A score from 0.0 to 1.0 indicating fit quality
- relevance: A brief explanation (1-2 sentences) of why this person is a good fit

Return ONLY a JSON array of 2-3 selected prospects in this format:
[
  {
    "prospect_index": 1,
    "priority": "high",
    "ai_score": 0.95,
    "relevance": "VP of Sales with direct authority over GTM tooling decisions"
  }
]

Return ONLY the JSON array, no additional text.`;
    }

    /**
     * Parse Claude's analysis response
     */
    parseAnalysisResponse(responseText, prospects) {
        try {
            // Extract JSON from response
            let jsonStr = responseText;
            const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (jsonMatch) {
                jsonStr = jsonMatch[1];
            }

            const analysis = JSON.parse(jsonStr);

            // Map analysis back to prospects
            return analysis.map(item => {
                const prospect = prospects[item.prospect_index - 1];
                if (!prospect) return null;

                return {
                    ...prospect,
                    priority: item.priority || 'medium',
                    ai_score: item.ai_score || 0.5,
                    relevance: item.relevance || 'Selected by AI'
                };
            }).filter(p => p !== null);
        } catch (error) {
            console.error('[Prospecting] Failed to parse Claude response:', error);
            console.error('[Prospecting] Response was:', responseText);
            // Fallback: return top 3
            return prospects.slice(0, 3).map((p, i) => ({
                ...p,
                priority: i === 0 ? 'high' : 'medium',
                ai_score: 1.0 - (i * 0.1),
                relevance: 'Selected by fallback logic'
            }));
        }
    }

    /**
     * Save selected prospects to database
     */
    async saveProspects(companyId, selectedProspects, allProspects) {
        const saved = [];

        for (const prospect of selectedProspects) {
            try {
                const prospectData = {
                    company_id: companyId,
                    name: prospect.name,
                    title: prospect.title,
                    linkedin_url: prospect.linkedin_url,
                    location: prospect.location,
                    priority: prospect.priority,
                    relevance: prospect.relevance,
                    ai_score: prospect.ai_score,
                    raw_data: prospect.raw_data || prospect
                };

                const result = await this.db.createProspect(prospectData);
                saved.push(result);
            } catch (error) {
                console.error(`[Prospecting] Failed to save prospect ${prospect.name}:`, error);
            }
        }

        return saved;
    }
}
