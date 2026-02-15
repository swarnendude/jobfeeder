import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import cookieParser from 'cookie-parser';
import { initializePostgresDatabase } from './db-postgres.js';
import { CompanyEnricher } from './enrichment.js';
import { WorkflowManager } from './workflow-manager.js';
import { ProspectingService } from './prospecting.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Render.com (required for secure cookies behind reverse proxy)
app.set('trust proxy', 1);

// Database, enricher, workflow manager, and prospecting service (initialized async)
let db = null;
let enricher = null;
let workflowManager = null;
let prospectingService = null;

// Middleware
app.use(express.json());
app.use(cookieParser());

// API Configuration
const JSEARCH_API_URL = 'https://jsearch.p.rapidapi.com';
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SIGNALHIRE_API_KEY = process.env.SIGNALHIRE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

// Auth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret-change-in-production';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// Read login.html template once (lazy, cached on first request)
let loginHtmlTemplate = null;
function getLoginHtml() {
    if (!loginHtmlTemplate) {
        loginHtmlTemplate = readFileSync(join(__dirname, 'public', 'login.html'), 'utf8');
    }
    return loginHtmlTemplate;
}

// Initialize Anthropic client
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Cache Configuration
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const searchCache = new Map();

// Cache helper functions
function getCacheKey(params) {
    const sortedParams = Object.keys(params)
        .sort()
        .reduce((obj, key) => {
            obj[key] = params[key];
            return obj;
        }, {});
    return JSON.stringify(sortedParams);
}

function getFromCache(key) {
    const cached = searchCache.get(key);
    if (!cached) return null;

    const now = Date.now();
    if (now - cached.timestamp > CACHE_TTL_MS) {
        searchCache.delete(key);
        return null;
    }

    return cached.data;
}

function setInCache(key, data) {
    searchCache.set(key, {
        data,
        timestamp: Date.now()
    });
}

function getCacheStats() {
    const now = Date.now();
    let validEntries = 0;
    let expiredEntries = 0;

    for (const [key, value] of searchCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
            expiredEntries++;
        } else {
            validEntries++;
        }
    }

    return { validEntries, expiredEntries, totalEntries: searchCache.size };
}

// Cleanup expired cache entries periodically
setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, value] of searchCache.entries()) {
        if (now - value.timestamp > CACHE_TTL_MS) {
            searchCache.delete(key);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`Cache cleanup: removed ${cleaned} expired entries`);
    }
}, 60 * 60 * 1000);

// ===== AUTH HELPERS =====

function createSessionToken(payload) {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify({
        ...payload,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor((Date.now() + SESSION_MAX_AGE_MS) / 1000)
    })).toString('base64url');
    const signature = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(`${header}.${body}`)
        .digest('base64url');
    return `${header}.${body}.${signature}`;
}

function verifySessionToken(token) {
    try {
        const [header, body, signature] = token.split('.');
        const expectedSig = crypto
            .createHmac('sha256', SESSION_SECRET)
            .update(`${header}.${body}`)
            .digest('base64url');
        if (signature !== expectedSig) return null;
        const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
        if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
        return payload;
    } catch {
        return null;
    }
}

function requireAuth(req, res, next) {
    const token = req.cookies?.session;
    if (!token) {
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        return res.redirect('/login.html');
    }

    const payload = verifySessionToken(token);
    if (!payload) {
        res.clearCookie('session', { path: '/' });
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Session expired' });
        }
        return res.redirect('/login.html');
    }

    // Re-check whitelist on every request (instant revocation if email removed)
    if (!ALLOWED_EMAILS.includes(payload.email)) {
        res.clearCookie('session', { path: '/' });
        if (req.path.startsWith('/api/')) {
            return res.status(403).json({ error: 'Access revoked' });
        }
        return res.redirect('/login.html');
    }

    req.user = payload;
    next();
}

// ===== PUBLIC ROUTES (no auth required) =====

// Serve login page (with client ID injected)
app.get('/login.html', (req, res) => {
    const html = getLoginHtml().replace('__GOOGLE_CLIENT_ID__', GOOGLE_CLIENT_ID || '');
    res.type('html').send(html);
});

// Health check (public for Render.com monitoring)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        jsearch: !!RAPIDAPI_KEY,
        claude: !!ANTHROPIC_API_KEY,
        gemini: !!GEMINI_API_KEY,
        signalhire: !!SIGNALHIRE_API_KEY,
        database: !!db,
        cache: getCacheStats()
    });
});

// Cache management (public)
app.delete('/api/cache', (req, res) => {
    const stats = getCacheStats();
    searchCache.clear();
    res.json({
        message: 'Cache cleared',
        entriesCleared: stats.totalEntries
    });
});

app.get('/api/cache', (req, res) => {
    const stats = getCacheStats();
    res.json({
        ...stats,
        ttlHours: CACHE_TTL_MS / (60 * 60 * 1000)
    });
});

// ===== AUTH ENDPOINTS (public) =====

// Verify Google token and create session
app.post('/api/auth/google', async (req, res) => {
    if (!googleClient) {
        return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    const { credential } = req.body;
    if (!credential) {
        return res.status(400).json({ error: 'Missing credential' });
    }

    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID,
        });
        const googlePayload = ticket.getPayload();
        const email = googlePayload.email.toLowerCase();

        if (!ALLOWED_EMAILS.includes(email)) {
            console.log(`[Auth] Access denied for: ${email}`);
            return res.status(403).json({
                error: 'Access denied',
                message: 'Your email is not authorized to use this application.'
            });
        }

        const sessionPayload = {
            email,
            name: googlePayload.name || email,
            picture: googlePayload.picture || null,
        };
        const sessionToken = createSessionToken(sessionPayload);

        res.cookie('session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: SESSION_MAX_AGE_MS,
            path: '/',
        });

        console.log(`[Auth] Login successful: ${email}`);
        res.json({ success: true, user: sessionPayload });
    } catch (error) {
        console.error('[Auth] Token verification failed:', error.message);
        res.status(401).json({ error: 'Invalid token' });
    }
});

// Check current session
app.get('/api/auth/me', (req, res) => {
    const token = req.cookies?.session;
    if (!token) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    const payload = verifySessionToken(token);
    if (!payload) {
        res.clearCookie('session', { path: '/' });
        return res.status(401).json({ error: 'Session expired' });
    }
    res.json({ user: { email: payload.email, name: payload.name, picture: payload.picture } });
});

// Logout
app.post('/api/auth/logout', (req, res) => {
    res.clearCookie('session', { path: '/' });
    res.json({ success: true });
});

// ===== AUTH MIDDLEWARE (everything below is protected) =====
app.use(requireAuth);

// Serve protected static files (after auth check)
app.use(express.static(join(__dirname, 'public')));

// Helper: extract domain from URL
function extractDomain(url) {
    if (!url) return null;
    try {
        return new URL(url.startsWith('http') ? url : `https://${url}`).hostname.replace('www.', '');
    } catch {
        return null;
    }
}

// Helper: format salary string from JSearch fields
function formatSalaryString(minSalary, maxSalary, currency, period) {
    if (!minSalary && !maxSalary) return null;
    const cur = currency || 'USD';
    const per = period ? `/${period.toLowerCase()}` : '';
    if (minSalary && maxSalary) {
        return `${cur} ${Number(minSalary).toLocaleString()} - ${Number(maxSalary).toLocaleString()}${per}`;
    }
    if (minSalary) return `${cur} ${Number(minSalary).toLocaleString()}+${per}`;
    return `Up to ${cur} ${Number(maxSalary).toLocaleString()}${per}`;
}

// Helper: transform JSearch job to normalized format
function transformJSearchJob(job) {
    const domain = extractDomain(job.employer_website);
    return {
        id: job.job_id,
        job_title: job.job_title,
        company: job.employer_name,
        company_domain: domain,
        location: [job.job_city, job.job_state, job.job_country].filter(Boolean).join(', '),
        short_location: [job.job_city, job.job_state].filter(Boolean).join(', ') || job.job_country || 'Not specified',
        date_posted: job.job_posted_at_datetime_utc,
        salary_string: formatSalaryString(job.job_min_salary, job.job_max_salary, job.job_salary_currency, job.job_salary_period),
        description: job.job_description,
        url: job.job_apply_link,
        final_url: job.job_apply_link,
        remote: job.job_is_remote || false,
        job_type: job.job_employment_type,
        seniority: null,
        technology_slugs: job.job_required_skills || [],
        company_object: {
            name: job.employer_name,
            domain: domain,
            logo: job.employer_logo,
            employee_count: null,
            industry: job.job_naics_name || null,
            funding_stage: null,
            country: job.job_country,
            city: job.job_city,
            founded_year: null,
            annual_revenue_usd_readable: null,
            total_funding_usd: null,
            technology_names: job.job_required_skills || [],
            linkedin_url: null,
            company_type: job.employer_company_type || null,
            website: job.employer_website || null
        },
        // JSearch-specific extras
        job_highlights: job.job_highlights || null,
        job_required_experience: job.job_required_experience || null,
        job_required_education: job.job_required_education || null,
        apply_options: job.apply_options || [],
        job_benefits: job.job_benefits || null,
        job_publisher: job.job_publisher || null
    };
}

// Job search endpoint with caching
app.post('/api/jobs/search', async (req, res) => {
    if (!RAPIDAPI_KEY) {
        return res.status(500).json({ error: 'RapidAPI key not configured' });
    }

    try {
        const cacheKey = getCacheKey(req.body);
        const cachedData = getFromCache(cacheKey);

        if (cachedData) {
            console.log('Cache HIT for query:', req.body.query || 'unknown');
            return res.json({
                ...cachedData,
                _cached: true,
                _cacheAge: Math.round((Date.now() - searchCache.get(cacheKey).timestamp) / 1000 / 60) + ' minutes'
            });
        }

        console.log('Cache MISS for query:', req.body.query || 'unknown');

        // Build JSearch query parameters
        const params = new URLSearchParams();
        params.append('query', req.body.query || '');
        params.append('page', req.body.page || 1);
        params.append('num_pages', req.body.num_pages || 1);

        if (req.body.date_posted) {
            params.append('date_posted', req.body.date_posted);
        }
        if (req.body.remote_jobs_only) {
            params.append('remote_jobs_only', 'true');
        }
        if (req.body.employment_types) {
            params.append('employment_types', req.body.employment_types);
        }
        if (req.body.job_requirements) {
            params.append('job_requirements', req.body.job_requirements);
        }

        const url = `${JSEARCH_API_URL}/search?${params.toString()}`;
        console.log('JSearch request URL:', url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
            }
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`JSearch API error ${response.status}:`, errorText);
            let errorMessage;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.message || errorData.info || JSON.stringify(errorData);
            } catch {
                errorMessage = errorText || `JSearch API error: ${response.status}`;
            }
            return res.status(response.status).json({ error: errorMessage });
        }

        const rawData = await response.json();

        // Transform JSearch response to normalized format
        const transformedJobs = (rawData.data || []).map(transformJSearchJob);

        const data = {
            data: transformedJobs,
            total: transformedJobs.length,
            _hasMore: transformedJobs.length > 0
        };

        setInCache(cacheKey, data);
        console.log('Cached results for query:', req.body.query || 'unknown', `(${transformedJobs.length} jobs)`);

        res.json({ ...data, _cached: false });
    } catch (error) {
        console.error('Job search error:', error);
        res.status(500).json({ error: 'Failed to search jobs' });
    }
});

// ===== SEARCH HISTORY ENDPOINTS =====

// Get search history
app.get('/api/search-history', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }
    try {
        const history = await db.getSearchHistory();
        res.json(history);
    } catch (error) {
        console.error('Get search history error:', error);
        res.status(500).json({ error: 'Failed to get search history' });
    }
});

// Save search to history
app.post('/api/search-history', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }
    try {
        const { query, params, criteria, results_count } = req.body;
        const entry = await db.saveSearchHistory(query, params, criteria, results_count || 0);
        res.json(entry);
    } catch (error) {
        console.error('Save search history error:', error);
        res.status(500).json({ error: 'Failed to save search history' });
    }
});

// Delete a search history entry
app.delete('/api/search-history/:id', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }
    try {
        await db.deleteSearchHistory(parseInt(req.params.id));
        res.json({ success: true });
    } catch (error) {
        console.error('Delete search history error:', error);
        res.status(500).json({ error: 'Failed to delete search history entry' });
    }
});

// Clear all search history
app.delete('/api/search-history', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }
    try {
        await db.clearSearchHistory();
        res.json({ success: true });
    } catch (error) {
        console.error('Clear search history error:', error);
        res.status(500).json({ error: 'Failed to clear search history' });
    }
});

// ===== FOLDER ENDPOINTS =====

// Create new folder
app.post('/api/folders', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { name, description } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Folder name is required' });
    }

    try {
        const folder = await db.createFolder(name, description);
        res.json(folder);
    } catch (error) {
        console.error('Error creating folder:', error);
        res.status(500).json({ error: 'Failed to create folder' });
    }
});

// Get all folders
app.get('/api/folders', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const folders = await db.getAllFolders();
        res.json(folders);
    } catch (error) {
        console.error('Error fetching folders:', error);
        res.status(500).json({ error: 'Failed to fetch folders' });
    }
});

// Get job-folder mappings (which jobs are in which folders)
app.get('/api/job-folder-mappings', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const mappings = await db.getJobFolderMappings();
        res.json(mappings);
    } catch (error) {
        console.error('Error fetching job-folder mappings:', error);
        res.status(500).json({ error: 'Failed to fetch job-folder mappings' });
    }
});

// Get single folder with jobs and prospects
app.get('/api/folders/:id', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;

    try {
        const folder = await db.getFolder(id);
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const jobs = await db.getJobsByFolder(id);
        const companies = await db.getCompaniesByFolder(id);
        const prospects = await db.getProspectsByFolder(id);
        const tasks = await db.getTasksByFolder(id);

        res.json({
            folder,
            jobs,
            companies,
            prospects,
            tasks
        });
    } catch (error) {
        console.error('Error fetching folder:', error);
        res.status(500).json({ error: 'Failed to fetch folder' });
    }
});

// Add job to folder
app.post('/api/folders/:id/jobs', async (req, res) => {
    if (!db || !workflowManager) {
        return res.status(503).json({ error: 'Database or workflow manager not initialized' });
    }

    const { id } = req.params;
    const jobData = req.body;

    try {
        const folder = await db.getFolder(id);
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Use workflow manager to add job (triggers automatic enrichment)
        const job = await workflowManager.addJobToFolder(id, jobData);

        console.log(`[API] Job "${jobData.job_title}" added to folder "${folder.name}" (ID: ${id})`);

        res.json({
            job,
            message: `Job "${jobData.job_title}" added to folder "${folder.name}". Company enrichment started in background.`
        });
    } catch (error) {
        console.error('Error adding job to folder:', error);
        console.error('Error stack:', error.stack);
        console.error('Job data received:', JSON.stringify(jobData, null, 2));
        res.status(500).json({
            error: 'Failed to add job to folder',
            message: error.message,
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Remove job from folder
app.delete('/api/folders/:folderId/jobs/:jobId', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { folderId, jobId } = req.params;

    try {
        const folder = await db.getFolder(folderId);
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        await db.removeJobFromFolder(folderId, jobId);

        console.log(`[API] Job ${jobId} removed from folder "${folder.name}" (ID: ${folderId})`);

        res.json({
            success: true,
            message: `Job removed from folder "${folder.name}"`
        });
    } catch (error) {
        console.error('Error removing job from folder:', error);
        res.status(500).json({
            error: 'Failed to remove job from folder',
            message: error.message
        });
    }
});

// Collect prospects for folder
app.post('/api/folders/:id/collect-prospects', async (req, res) => {
    if (!db || !workflowManager) {
        return res.status(503).json({ error: 'Database or workflow manager not initialized' });
    }

    const { id } = req.params;

    try {
        const folder = await db.getFolder(id);
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Start prospect collection in background
        workflowManager.collectProspectsForFolder(id)
            .then(prospects => {
                console.log(`[Server] Prospect collection completed for folder ${id}: ${prospects.length} prospects`);
            })
            .catch(error => {
                console.error(`[Server] Prospect collection failed for folder ${id}:`, error.message);
            });

        res.json({
            status: 'processing',
            message: 'Prospect collection started in background'
        });
    } catch (error) {
        console.error('Error starting prospect collection:', error);
        res.status(500).json({ error: 'Failed to start prospect collection' });
    }
});

// Auto-select top prospects
app.post('/api/folders/:id/auto-select', async (req, res) => {
    if (!db || !workflowManager) {
        return res.status(503).json({ error: 'Database or workflow manager not initialized' });
    }

    const { id } = req.params;

    try {
        const folder = await db.getFolder(id);
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        await workflowManager.autoSelectProspects(id);

        res.json({
            status: 'success',
            message: 'Top 2-3 prospects per company have been auto-selected'
        });
    } catch (error) {
        console.error('Error auto-selecting prospects:', error);
        res.status(500).json({ error: 'Failed to auto-select prospects' });
    }
});

// Manually select/deselect prospect
app.patch('/api/prospects/:id/select', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const { selected } = req.body;

    try {
        await db.updateProspectSelection(id, selected, false);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error updating prospect selection:', error);
        res.status(500).json({ error: 'Failed to update prospect selection' });
    }
});

// Enrich selected prospects with contact info
app.post('/api/folders/:id/enrich-contacts', async (req, res) => {
    if (!db || !workflowManager) {
        return res.status(503).json({ error: 'Database or workflow manager not initialized' });
    }

    const { id } = req.params;

    try {
        const folder = await db.getFolder(id);
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Start contact enrichment in background
        workflowManager.enrichSelectedProspects(id)
            .then(result => {
                console.log(`[Server] Contact enrichment completed for folder ${id}: ${result.enriched}/${result.total}`);
            })
            .catch(error => {
                console.error(`[Server] Contact enrichment failed for folder ${id}:`, error.message);
            });

        res.json({
            status: 'processing',
            message: 'Contact enrichment started in background'
        });
    } catch (error) {
        console.error('Error starting contact enrichment:', error);
        res.status(500).json({ error: error.message || 'Failed to start contact enrichment' });
    }
});

// Delete folder
app.delete('/api/folders/:id', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;

    try {
        await db.deleteFolder(id);
        res.json({ status: 'success', message: 'Folder deleted' });
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ error: 'Failed to delete folder' });
    }
});

// ===== KNOWLEDGE BASE ENDPOINTS =====

// Get all knowledge base entries
app.get('/api/knowledge', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const knowledge = await db.getAllKnowledge();
        res.json(knowledge);
    } catch (error) {
        console.error('Error fetching knowledge base:', error);
        res.status(500).json({ error: 'Failed to fetch knowledge base' });
    }
});

// Add knowledge base entry
app.post('/api/knowledge', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { type, title, content, metadata } = req.body;

    if (!type || !title || !content) {
        return res.status(400).json({ error: 'Type, title, and content are required' });
    }

    try {
        const entry = await db.addKnowledge(type, title, content, metadata);
        res.json(entry);
    } catch (error) {
        console.error('Error adding knowledge:', error);
        res.status(500).json({ error: 'Failed to add knowledge' });
    }
});

// Update knowledge base entry
app.patch('/api/knowledge/:id', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;
    const { content, metadata } = req.body;

    try {
        await db.updateKnowledge(id, content, metadata);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error updating knowledge:', error);
        res.status(500).json({ error: 'Failed to update knowledge' });
    }
});

// ===== NOTIFICATION ENDPOINTS =====

// Get unread notifications
app.get('/api/notifications/unread', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const notifications = await db.getUnreadNotifications();
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Get recent notifications
app.get('/api/notifications', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const notifications = await db.getRecentNotifications(50);
        res.json(notifications);
    } catch (error) {
        console.error('Error fetching notifications:', error);
        res.status(500).json({ error: 'Failed to fetch notifications' });
    }
});

// Mark notification as read
app.patch('/api/notifications/:id/read', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { id } = req.params;

    try {
        await db.markNotificationRead(id);
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});

// Mark all notifications as read
app.post('/api/notifications/read-all', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        await db.markAllNotificationsRead();
        res.json({ status: 'success' });
    } catch (error) {
        console.error('Error marking all notifications as read:', error);
        res.status(500).json({ error: 'Failed to mark all notifications as read' });
    }
});

// ===== BACKGROUND TASK ENDPOINTS =====

// Get all tasks
app.get('/api/tasks', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const tasks = await db.getRecentTasks(100);
        res.json(tasks);
    } catch (error) {
        console.error('Error fetching tasks:', error);
        res.status(500).json({ error: 'Failed to fetch tasks' });
    }
});

// Get active tasks
app.get('/api/tasks/active', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const tasks = await db.getActiveTasks();
        res.json(tasks);
    } catch (error) {
        console.error('Error fetching active tasks:', error);
        res.status(500).json({ error: 'Failed to fetch active tasks' });
    }
});

// ===== COMPANY ENDPOINTS (Legacy support) =====

app.get('/api/companies', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const companies = await db.getAllCompanies();
        const stats = await db.getStats();
        res.json({ companies, stats });
    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Failed to fetch companies' });
    }
});

app.get('/api/companies/:domain', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { domain } = req.params;

    try {
        const company = await db.getCompany(domain);
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }
        res.json(company);
    } catch (error) {
        console.error('Error fetching company:', error);
        res.status(500).json({ error: 'Failed to fetch company' });
    }
});

// Retry enrichment for a single company
app.post('/api/companies/:domain/retry', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { domain } = req.params;

    try {
        const company = await db.getCompany(domain);
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        await db.resetForRetry(domain);
        console.log(`[Server] Reset enrichment status for ${domain} to retry`);

        res.json({ success: true, message: 'Company enrichment reset for retry' });
    } catch (error) {
        console.error('Error retrying enrichment:', error);
        res.status(500).json({ error: 'Failed to retry enrichment' });
    }
});

// Bulk retry all failed companies
app.post('/api/companies/bulk/retry-failed', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    try {
        const resetCompanies = await db.resetAllFailed();
        console.log(`[Server] Reset ${resetCompanies.length} failed companies for retry`);

        res.json({
            success: true,
            count: resetCompanies.length,
            message: `${resetCompanies.length} failed companies reset for retry`
        });
    } catch (error) {
        console.error('Error bulk retrying enrichment:', error);
        res.status(500).json({ error: 'Failed to bulk retry enrichment' });
    }
});

// Start prospecting for a company
app.post('/api/companies/:domain/prospect', async (req, res) => {
    if (!prospectingService) {
        return res.status(503).json({ error: 'Prospecting service not initialized' });
    }

    const { domain } = req.params;

    try {
        console.log(`[Server] Starting prospecting for ${domain}`);
        const result = await prospectingService.startProspecting(domain);

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Error starting prospecting:', error);
        res.status(500).json({ error: error.message || 'Failed to start prospecting' });
    }
});

// Get prospects for a company
app.get('/api/companies/:domain/prospects', async (req, res) => {
    if (!db) {
        return res.status(503).json({ error: 'Database not initialized' });
    }

    const { domain } = req.params;

    try {
        const company = await db.getCompany(domain);
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        const prospects = await db.getProspectsByCompany(company.id);
        res.json({ prospects });
    } catch (error) {
        console.error('Error fetching prospects:', error);
        res.status(500).json({ error: 'Failed to fetch prospects' });
    }
});

// Bulk prospect all companies in a folder
app.post('/api/folders/:id/prospect-all', async (req, res) => {
    if (!prospectingService || !db) {
        return res.status(503).json({ error: 'Services not initialized' });
    }

    const { id: folderId } = req.params;

    try {
        console.log(`[Server] Starting bulk prospecting for folder ${folderId}`);

        // Get all enriched companies in the folder
        const folder = await db.getFolder(folderId);
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        const companies = await db.getCompaniesByFolder(folderId);
        const enrichedCompanies = companies.filter(c => c.enrichment_status === 'completed');

        if (enrichedCompanies.length === 0) {
            return res.status(400).json({ error: 'No enriched companies to prospect' });
        }

        // Start prospecting for each company (run in background)
        const results = {
            total: enrichedCompanies.length,
            started: 0,
            errors: []
        };

        // Process companies sequentially to avoid overwhelming APIs
        for (const company of enrichedCompanies) {
            try {
                await prospectingService.startProspecting(company.domain);
                results.started++;
            } catch (error) {
                console.error(`[Server] Failed to prospect ${company.domain}:`, error.message);
                results.errors.push({
                    domain: company.domain,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            message: `Started prospecting for ${results.started}/${results.total} companies`,
            ...results
        });
    } catch (error) {
        console.error('Error in bulk prospecting:', error);
        res.status(500).json({ error: error.message || 'Failed to start bulk prospecting' });
    }
});

// Catch-all for SPA
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

// Initialize database and start server
async function startServer() {
    try {
        if (!DATABASE_URL) {
            throw new Error('DATABASE_URL environment variable is required');
        }

        // Initialize PostgreSQL database
        db = await initializePostgresDatabase(DATABASE_URL);
        console.log('PostgreSQL database initialized');

        // Initialize enricher
        if (GEMINI_API_KEY || anthropic) {
            enricher = new CompanyEnricher({
                anthropicClient: anthropic,
                geminiApiKey: GEMINI_API_KEY,
                db: db,
                signalHireApiKey: SIGNALHIRE_API_KEY
            });
            console.log('Company enricher initialized');
        } else {
            console.log('Company enricher not available (need GEMINI_API_KEY or ANTHROPIC_API_KEY)');
        }

        // Initialize workflow manager
        if (enricher) {
            workflowManager = new WorkflowManager({
                db: db,
                enricher: enricher,
                signalHireApiKey: SIGNALHIRE_API_KEY,
                geminiApiKey: GEMINI_API_KEY
            });
            console.log('Workflow manager initialized');
        }

        // Initialize prospecting service
        if (anthropic || SIGNALHIRE_API_KEY) {
            prospectingService = new ProspectingService({
                anthropicClient: anthropic,
                signalHireApiKey: SIGNALHIRE_API_KEY,
                db: db
            });
            console.log('Prospecting service initialized');
        }

        // Start server
        app.listen(PORT, () => {
            console.log(`JobFeeder server running on port ${PORT}`);
            console.log(`JSearch API: ${RAPIDAPI_KEY ? 'Configured' : 'Not configured'}`);
            console.log(`Claude API: ${ANTHROPIC_API_KEY ? 'Configured' : 'Not configured'}`);
            console.log(`Gemini API: ${GEMINI_API_KEY ? 'Configured (used for enrichment)' : 'Not configured'}`);
            console.log(`SignalHire API: ${SIGNALHIRE_API_KEY ? 'Configured' : 'Not configured'}`);
            console.log(`Database: PostgreSQL (Render.com)`);
            console.log(`Google Auth: ${GOOGLE_CLIENT_ID ? 'Configured' : 'Not configured'}`);
            console.log(`Allowed emails: ${ALLOWED_EMAILS.length} configured`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
