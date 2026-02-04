import { GoogleGenerativeAI } from '@google/generative-ai';

const SIGNALHIRE_API_URL = 'https://www.signalhire.com/api/v1/search/companies';
const SIGNALHIRE_PERSON_URL = 'https://www.signalhire.com/api/v1/candidate/search';

/**
 * WorkflowManager handles the complete flow:
 * 1. Jobs added to folder
 * 2. Company enrichment (automatic)
 * 3. Prospect collection
 * 4. Prospect filtering and AI selection
 */
export class WorkflowManager {
    constructor(options = {}) {
        this.db = options.db;
        this.enricher = options.enricher; // CompanyEnricher instance
        this.signalHireApiKey = options.signalHireApiKey || process.env.SIGNALHIRE_API_KEY;
        this.geminiApiKey = options.geminiApiKey || process.env.GEMINI_API_KEY;

        if (this.geminiApiKey) {
            this.gemini = new GoogleGenerativeAI(this.geminiApiKey);
            this.geminiModel = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash' });
        }

        this.processingQueue = new Map(); // Track active processing
    }

    // ===== STAGE 1: Add Job and Trigger Enrichment =====

    async addJobToFolder(folderId, jobData) {
        console.log(`[Workflow] Adding job to folder ${folderId}:`, {
            job_title: jobData.job_title,
            company: jobData.company,
            domain: jobData.domain
        });

        // Add job to database (this also creates/gets the company via getOrCreateCompany)
        const job = await this.db.addJobToFolder(folderId, {
            theirstack_job_id: jobData.id || null,
            job_title: jobData.job_title,
            company_name: jobData.company,
            company_domain: jobData.domain,
            company_data: jobData.theirstack_company_data || null,  // Pass company data for storage
            location: jobData.location,
            country: jobData.country,
            salary_string: jobData.salary_string,
            description: jobData.description,
            job_url: jobData.url,
            posted_date: jobData.posted_date,
            raw_data: jobData
        });

        // Check if company needs enrichment
        console.log(`[Workflow] Checking company enrichment status for domain: "${jobData.domain}"`);
        const company = await this.db.getCompany(jobData.domain);

        if (company) {
            console.log(`[Workflow] Company found: ${company.name} (status: ${company.enrichment_status})`);

            if (company.enrichment_status === 'pending') {
                // Trigger automatic enrichment in background
                console.log(`[Workflow] Triggering automatic enrichment for ${jobData.domain}`);
                this.enrichCompany(folderId, jobData.domain, jobData.company)
                    .catch(err => console.error(`[Workflow] Enrichment failed for ${jobData.domain}:`, err));
            } else if (company.enrichment_status === 'failed') {
                // Retry failed enrichment
                console.log(`[Workflow] Retrying failed enrichment for ${jobData.domain}`);
                this.enrichCompany(folderId, jobData.domain, jobData.company)
                    .catch(err => console.error(`[Workflow] Retry enrichment failed for ${jobData.domain}:`, err));
            }
        }

        return job;
    }

    // ===== STAGE 2: Company Enrichment =====

    async enrichCompany(folderId, domain, companyName) {
        // Create background task
        const task = await this.db.createTask('company_enrichment', folderId, null, 1);

        try {
            await this.db.updateTaskStatus(task.id, 'processing', 0);

            // Use existing enricher
            const result = await this.enricher.enrichWithRetry(domain, companyName);

            await this.db.updateTaskStatus(task.id, 'completed', 1);
            await this.db.updateTaskResult(task.id, result);

            // Create notification
            await this.db.createNotification(
                'enrichment_complete',
                'Company Enrichment Complete',
                `${companyName} has been enriched successfully`,
                `/folders/${folderId}`
            );

            // Check if all companies in folder are enriched
            await this.checkFolderEnrichmentStatus(folderId);

            return result;
        } catch (error) {
            await this.db.updateTaskStatus(task.id, 'failed', 0, error.message);

            await this.db.createNotification(
                'enrichment_failed',
                'Company Enrichment Failed',
                `Failed to enrich ${companyName}: ${error.message}`,
                `/folders/${folderId}`
            );

            throw error;
        }
    }

    async checkFolderEnrichmentStatus(folderId) {
        const jobs = await this.db.getJobsByFolder(folderId);
        const folder = await this.db.getFolder(folderId);

        if (folder.status !== 'jobs_added') {
            return; // Already moved past this stage
        }

        // Check if all companies are enriched
        const allEnriched = await Promise.all(
            jobs.map(async (job) => {
                const company = await this.db.getCompany(job.company_domain);
                return company && company.enrichment_status === 'completed';
            })
        );

        if (allEnriched.every(Boolean)) {
            await this.db.updateFolderStatus(folderId, 'company_enriched');
            await this.db.createNotification(
                'folder_ready',
                'Folder Ready for Prospect Collection',
                `All companies in folder have been enriched`,
                `/folders/${folderId}`
            );
        }
    }

    // ===== STAGE 3: Prospect Collection =====

    async collectProspectsForFolder(folderId) {
        const folder = await this.db.getFolder(folderId);

        if (folder.status === 'jobs_added') {
            throw new Error('Please wait for company enrichment to complete first');
        }

        const jobs = await this.db.getJobsByFolder(folderId);

        // Create background task
        const task = await this.db.createTask('prospect_collection', folderId, null, jobs.length);

        try {
            await this.db.updateTaskStatus(task.id, 'processing', 0);

            const allProspects = [];
            let processed = 0;

            for (const job of jobs) {
                const company = await this.db.getCompany(job.company_domain);

                if (!company || company.enrichment_status !== 'completed') {
                    processed++;
                    continue;
                }

                // Collect prospects for this company
                const prospects = await this.collectProspectsForCompany(
                    folderId,
                    company,
                    job
                );

                allProspects.push(...prospects);
                processed++;

                await this.db.updateTaskStatus(task.id, 'processing', processed);
            }

            await this.db.updateTaskStatus(task.id, 'completed', processed);
            await this.db.updateTaskResult(task.id, { total_prospects: allProspects.length });

            // Update folder status
            await this.db.updateFolderStatus(folderId, 'prospects_collected');

            // Create notification
            await this.db.createNotification(
                'prospects_collected',
                'Prospect Collection Complete',
                `Collected ${allProspects.length} prospects from ${jobs.length} companies`,
                `/folders/${folderId}`
            );

            return allProspects;
        } catch (error) {
            await this.db.updateTaskStatus(task.id, 'failed', 0, error.message);
            throw error;
        }
    }

    async collectProspectsForCompany(folderId, company, job) {
        const enrichedData = company.enriched_data;
        const companySize = company.employee_count || 100; // Default if unknown
        const jobCountry = job.country;

        console.log(`[Workflow] Collecting prospects for ${company.name} (${companySize} employees)`);

        // Determine if we should include founders
        const includeFounders = companySize <= 50;
        const includeVPs = companySize >= 50;

        // Get prospects from enriched data
        let candidates = [];

        // Add target contacts from website scraping
        if (enrichedData?.target_contacts) {
            candidates.push(...enrichedData.target_contacts.map(c => ({
                source: 'website',
                ...c
            })));
        }

        // Add founders if applicable
        if (includeFounders && enrichedData?.founders) {
            candidates.push(...enrichedData.founders.map(f => ({
                source: 'website',
                name: f.name,
                title: f.title || 'Founder',
                department: 'Executive',
                linkedin_url: f.linkedin_url,
                priority: 'high',
                relevance: 'Founder - key decision maker for small company'
            })));
        }

        // Add leadership team
        if (enrichedData?.leadership_team) {
            candidates.push(...enrichedData.leadership_team.map(l => ({
                source: 'website',
                ...l,
                department: this.inferDepartment(l.title),
                priority: this.inferPriority(l.title, companySize)
            })));
        }

        // If we need more prospects, use SignalHire
        if (candidates.length < 20 && this.signalHireApiKey) {
            console.log(`[Workflow] Searching SignalHire for additional prospects at ${company.name}`);
            const signalHireProspects = await this.searchSignalHireProspects(
                company.domain,
                company.name,
                job.job_title,
                jobCountry,
                companySize,
                20 - candidates.length
            );
            candidates.push(...signalHireProspects);
        }

        // Filter and limit to 20 prospects
        const filteredProspects = await this.filterAndRankProspects(
            candidates,
            job,
            company,
            companySize
        );

        // Save to database
        const savedProspects = [];
        for (const prospect of filteredProspects) {
            const saved = await this.db.createProspect({
                folder_id: folderId,
                company_id: company.id,
                name: prospect.name,
                title: prospect.title,
                department: prospect.department,
                linkedin_url: prospect.linkedin_url,
                email: prospect.email,
                phone: prospect.phone,
                location: prospect.location,
                priority: prospect.priority,
                relevance: prospect.relevance,
                ai_score: prospect.ai_score,
                raw_data: prospect
            });
            savedProspects.push(saved);
        }

        return savedProspects;
    }

    async searchSignalHireProspects(domain, companyName, jobTitle, jobCountry, companySize, limit = 20) {
        if (!this.signalHireApiKey) {
            return [];
        }

        try {
            // Determine target roles based on company size and job type
            const targetRoles = this.determineTargetRoles(jobTitle, companySize);

            const searchParams = {
                company: companyName,
                titles: targetRoles,
                limit: Math.min(limit, 20)
            };

            // Add location filter if job country is specified
            if (jobCountry) {
                searchParams.country = jobCountry;
            }

            console.log(`[Workflow] SignalHire search:`, searchParams);

            const response = await fetch(SIGNALHIRE_API_URL, {
                method: 'POST',
                headers: {
                    'apikey': this.signalHireApiKey,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                body: JSON.stringify(searchParams)
            });

            if (!response.ok) {
                console.error(`[Workflow] SignalHire API error: ${response.status}`);
                return [];
            }

            const data = await response.json();

            if (data.items && data.items.length > 0) {
                return data.items.map(item => ({
                    source: 'signalhire',
                    name: item.fullName || item.name,
                    title: item.currentTitle,
                    department: this.inferDepartment(item.currentTitle),
                    linkedin_url: item.linkedin,
                    location: item.location,
                    priority: this.inferPriority(item.currentTitle, companySize),
                    relevance: `Found via SignalHire search for ${jobTitle} roles`
                }));
            }

            return [];
        } catch (error) {
            console.error('[Workflow] SignalHire search error:', error);
            return [];
        }
    }

    determineTargetRoles(jobTitle, companySize) {
        // Infer department from job title
        const jobLower = jobTitle.toLowerCase();
        const roles = [];

        // GTM/Sales/Marketing roles
        if (jobLower.includes('gtm') || jobLower.includes('go-to-market') ||
            jobLower.includes('sales') || jobLower.includes('marketing') ||
            jobLower.includes('revenue')) {

            if (companySize < 50) {
                roles.push('Founder', 'CEO', 'Co-Founder');
            }

            if (companySize >= 50) {
                roles.push(
                    'VP Sales', 'VP Marketing', 'VP Revenue', 'VP Growth',
                    'Head of Sales', 'Head of Marketing', 'Head of Revenue',
                    'Chief Revenue Officer', 'CRO'
                );
            }

            if (companySize >= 500) {
                roles.push('Director of Sales', 'Director of Marketing');
            }
        }

        // Engineering/Technical roles
        if (jobLower.includes('engineer') || jobLower.includes('developer') ||
            jobLower.includes('technical')) {

            if (companySize < 50) {
                roles.push('CTO', 'Founder');
            }

            if (companySize >= 50) {
                roles.push('VP Engineering', 'Head of Engineering', 'CTO');
            }
        }

        // Default fallback
        if (roles.length === 0) {
            if (companySize < 50) {
                roles.push('Founder', 'CEO');
            } else {
                roles.push('VP', 'Head', 'Director', 'Chief');
            }
        }

        return roles;
    }

    inferDepartment(title) {
        if (!title) return null;

        const titleLower = title.toLowerCase();

        if (titleLower.includes('sales') || titleLower.includes('revenue')) return 'Sales';
        if (titleLower.includes('marketing') || titleLower.includes('growth') || titleLower.includes('demand')) return 'Marketing';
        if (titleLower.includes('engineer') || titleLower.includes('tech') || titleLower.includes('cto')) return 'Engineering';
        if (titleLower.includes('product')) return 'Product';
        if (titleLower.includes('founder') || titleLower.includes('ceo') || titleLower.includes('chief')) return 'Executive';
        if (titleLower.includes('operations') || titleLower.includes('ops')) return 'Operations';

        return 'Other';
    }

    inferPriority(title, companySize) {
        if (!title) return 'low';

        const titleLower = title.toLowerCase();

        // High priority for founders in small companies
        if (companySize < 50 && (titleLower.includes('founder') || titleLower.includes('ceo'))) {
            return 'high';
        }

        // High priority for C-level and VPs
        if (titleLower.includes('chief') || titleLower.includes('cro') ||
            titleLower.match(/\bvp\b/) || titleLower.includes('vice president')) {
            return 'high';
        }

        // Medium for heads and directors
        if (titleLower.includes('head') || titleLower.includes('director')) {
            return 'medium';
        }

        return 'low';
    }

    async filterAndRankProspects(candidates, job, company, companySize) {
        // Remove duplicates by name + company
        const uniqueMap = new Map();
        for (const c of candidates) {
            const key = `${c.name?.toLowerCase()}-${company.domain}`;
            if (!uniqueMap.has(key) || uniqueMap.get(key).priority === 'low') {
                uniqueMap.set(key, c);
            }
        }

        let prospects = Array.from(uniqueMap.values());

        // Filter by location if job has country specified
        if (job.country) {
            prospects = prospects.filter(p => {
                if (!p.location) return true; // Keep if location unknown
                return p.location.toLowerCase().includes(job.country.toLowerCase());
            });
        }

        // Use Gemini to score and rank prospects
        if (this.geminiModel && prospects.length > 0) {
            prospects = await this.scoreProspectsWithAI(prospects, job, company, companySize);
        } else {
            // Manual scoring as fallback
            prospects = prospects.map(p => ({
                ...p,
                ai_score: this.manualScore(p, job, companySize)
            }));
        }

        // Sort by AI score and priority
        prospects.sort((a, b) => {
            const priorityWeight = { high: 3, medium: 2, low: 1 };
            const scoreA = (a.ai_score || 0) * priorityWeight[a.priority || 'low'];
            const scoreB = (b.ai_score || 0) * priorityWeight[b.priority || 'low'];
            return scoreB - scoreA;
        });

        // Return top 20
        return prospects.slice(0, 20);
    }

    async scoreProspectsWithAI(prospects, job, company, companySize) {
        const prompt = `You are helping score prospects for a B2B outreach campaign for GTM engineering services.

Company: ${company.name}
Company Size: ${companySize} employees
Job Title: ${job.job_title}
Job Location: ${job.location || 'Not specified'}
Job Description: ${job.description?.substring(0, 500) || 'Not available'}

Prospects to score:
${prospects.map((p, i) => `${i + 1}. ${p.name} - ${p.title || 'Unknown title'} (Priority: ${p.priority || 'unknown'})`).join('\n')}

Score each prospect from 0.0 to 1.0 based on:
1. Job relevance to GTM/Sales/Marketing decision-making
2. Seniority level appropriate for company size
3. Likelihood to be interested in GTM engineering services

Return ONLY a JSON array with scores:
[0.85, 0.72, 0.91, ...]

One score per prospect in the same order.`;

        try {
            const result = await this.geminiModel.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            // Parse JSON array
            const scores = JSON.parse(text.match(/\[[\d\s,\.]+\]/)[0]);

            return prospects.map((p, i) => ({
                ...p,
                ai_score: scores[i] || 0.5
            }));
        } catch (error) {
            console.error('[Workflow] AI scoring error:', error);
            // Fallback to manual scoring
            return prospects.map(p => ({
                ...p,
                ai_score: this.manualScore(p, job, companySize)
            }));
        }
    }

    manualScore(prospect, job, companySize) {
        let score = 0.5; // Base score

        const title = prospect.title?.toLowerCase() || '';

        // Boost for C-level
        if (title.includes('chief') || title.includes('cro')) score += 0.3;

        // Boost for VPs
        if (title.match(/\bvp\b/) || title.includes('vice president')) score += 0.25;

        // Boost for Heads
        if (title.includes('head')) score += 0.2;

        // Boost for Directors
        if (title.includes('director')) score += 0.15;

        // Boost for founders in small companies
        if (companySize < 50 && (title.includes('founder') || title.includes('ceo'))) {
            score += 0.3;
        }

        // Boost for relevant departments
        if (title.includes('sales') || title.includes('revenue') || title.includes('marketing') || title.includes('growth')) {
            score += 0.1;
        }

        return Math.min(score, 1.0);
    }

    // ===== STAGE 4: AI Auto-Selection of Top 2-3 Prospects =====

    async autoSelectProspects(folderId) {
        const prospects = await this.db.getProspectsByFolder(folderId);

        // Group by company
        const byCompany = {};
        for (const p of prospects) {
            if (!byCompany[p.company_id]) {
                byCompany[p.company_id] = [];
            }
            byCompany[p.company_id].push(p);
        }

        // Auto-select top 2-3 per company
        for (const [companyId, companyProspects] of Object.entries(byCompany)) {
            // Already sorted by priority and score
            const topProspects = companyProspects.slice(0, 3);

            for (const prospect of topProspects) {
                await this.db.updateProspectSelection(prospect.id, true, true);
            }
        }

        // Update folder status
        await this.db.updateFolderStatus(folderId, 'prospects_selected');

        // Create notification
        await this.db.createNotification(
            'prospects_selected',
            'Prospects Auto-Selected',
            `Top prospects have been automatically selected for outreach`,
            `/folders/${folderId}`
        );
    }

    // ===== STAGE 5: Enrich Selected Prospects with Contact Info =====

    async enrichSelectedProspects(folderId) {
        const selectedProspects = await this.db.getSelectedProspects(folderId);

        // Check daily email limit
        const dailyLimit = 150;
        const todayCount = await this.db.getTodayEmailCount();
        const canCollect = todayCount + selectedProspects.length <= dailyLimit;

        if (!canCollect) {
            throw new Error(`Daily email collection limit reached (${todayCount}/${dailyLimit}). Try again tomorrow.`);
        }

        // Create background task
        const task = await this.db.createTask('contact_enrichment', folderId, null, selectedProspects.length);

        try {
            await this.db.updateTaskStatus(task.id, 'processing', 0);

            let enriched = 0;
            let processed = 0;

            for (const prospect of selectedProspects) {
                if (prospect.signalhire_enriched) {
                    processed++;
                    continue; // Skip already enriched
                }

                // Use SignalHire to get contact info
                const contactInfo = await this.enricher.lookupContactSignalHire(
                    prospect,
                    prospect.company_domain
                );

                if (contactInfo.email) {
                    await this.db.updateProspectContact(
                        prospect.id,
                        contactInfo.email,
                        contactInfo.phone,
                        true
                    );
                    enriched++;
                    await this.db.incrementEmailCount(1);
                }

                processed++;
                await this.db.updateTaskStatus(task.id, 'processing', processed);

                // Rate limiting
                await this.delay(200);
            }

            await this.db.updateTaskStatus(task.id, 'completed', processed);
            await this.db.updateTaskResult(task.id, { enriched_count: enriched });

            // Create notification
            await this.db.createNotification(
                'contacts_enriched',
                'Contact Enrichment Complete',
                `Enriched ${enriched} contacts with email addresses`,
                `/folders/${folderId}`
            );

            return { enriched, total: selectedProspects.length };
        } catch (error) {
            await this.db.updateTaskStatus(task.id, 'failed', 0, error.message);
            throw error;
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
