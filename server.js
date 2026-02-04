import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { initializePostgresDatabase } from './db-postgres.js';
import { CompanyEnricher } from './enrichment.js';
import { WorkflowManager } from './workflow-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Database, enricher, and workflow manager (initialized async)
let db = null;
let enricher = null;
let workflowManager = null;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// API Configuration
const THEIRSTACK_API_URL = 'https://api.theirstack.com/v1';
const THEIRSTACK_API_KEY = process.env.THEIRSTACK_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SIGNALHIRE_API_KEY = process.env.SIGNALHIRE_API_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

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

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        theirstack: !!THEIRSTACK_API_KEY,
        claude: !!ANTHROPIC_API_KEY,
        gemini: !!GEMINI_API_KEY,
        signalhire: !!SIGNALHIRE_API_KEY,
        database: !!db,
        cache: getCacheStats()
    });
});

// Cache management
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

// Job search endpoint with caching
app.post('/api/jobs/search', async (req, res) => {
    if (!THEIRSTACK_API_KEY) {
        return res.status(500).json({ error: 'Theirstack API key not configured' });
    }

    try {
        const cacheKey = getCacheKey(req.body);
        const cachedData = getFromCache(cacheKey);

        if (cachedData) {
            console.log('Cache HIT for query:', req.body.job_title_pattern_or?.join(', ') || 'unknown');
            return res.json({
                ...cachedData,
                _cached: true,
                _cacheAge: Math.round((Date.now() - searchCache.get(cacheKey).timestamp) / 1000 / 60) + ' minutes'
            });
        }

        console.log('Cache MISS for query:', req.body.job_title_pattern_or?.join(', ') || 'unknown');

        const response = await fetch(`${THEIRSTACK_API_URL}/jobs/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${THEIRSTACK_API_KEY}`
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            return res.status(response.status).json({
                error: errorData.message || `Theirstack API error: ${response.status}`
            });
        }

        const data = await response.json();
        setInCache(cacheKey, data);
        console.log('Cached results for query:', req.body.job_title_pattern_or?.join(', ') || 'unknown');

        res.json({ ...data, _cached: false });
    } catch (error) {
        console.error('Job search error:', error);
        res.status(500).json({ error: 'Failed to search jobs' });
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

        // Start server
        app.listen(PORT, () => {
            console.log(`JobFeeder server running on port ${PORT}`);
            console.log(`Theirstack API: ${THEIRSTACK_API_KEY ? 'Configured' : 'Not configured'}`);
            console.log(`Claude API: ${ANTHROPIC_API_KEY ? 'Configured' : 'Not configured'}`);
            console.log(`Gemini API: ${GEMINI_API_KEY ? 'Configured (used for enrichment)' : 'Not configured'}`);
            console.log(`SignalHire API: ${SIGNALHIRE_API_KEY ? 'Configured' : 'Not configured'}`);
            console.log(`Database: PostgreSQL (Render.com)`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
