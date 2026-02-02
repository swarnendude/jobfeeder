import 'dotenv/config';
import express from 'express';
import Anthropic from '@anthropic-ai/sdk';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

// API Configuration
const THEIRSTACK_API_URL = 'https://api.theirstack.com/v1';
const THEIRSTACK_API_KEY = process.env.THEIRSTACK_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Initialize Anthropic client
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Cache Configuration
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours in milliseconds
const searchCache = new Map();

// Cache helper functions
function getCacheKey(params) {
    // Create a stable cache key from search parameters
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
        // Cache expired
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

// Cleanup expired cache entries periodically (every hour)
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
}, 60 * 60 * 1000); // Run every hour

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        theirstack: !!THEIRSTACK_API_KEY,
        claude: !!ANTHROPIC_API_KEY,
        cache: getCacheStats()
    });
});

// Cache management endpoint
app.delete('/api/cache', (req, res) => {
    const stats = getCacheStats();
    searchCache.clear();
    res.json({
        message: 'Cache cleared',
        entriesCleared: stats.totalEntries
    });
});

// Get cache info
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
        // Check cache first
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

        // Store in cache
        setInCache(cacheKey, data);
        console.log('Cached results for query:', req.body.job_title_pattern_or?.join(', ') || 'unknown');

        res.json({ ...data, _cached: false });
    } catch (error) {
        console.error('Job search error:', error);
        res.status(500).json({ error: 'Failed to search jobs' });
    }
});

// Claude AI - Analyze job posting
app.post('/api/ai/analyze-job', async (req, res) => {
    if (!anthropic) {
        return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const { job } = req.body;
    if (!job) {
        return res.status(400).json({ error: 'Job data required' });
    }

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1024,
            messages: [{
                role: 'user',
                content: `Analyze this job posting and provide a brief summary with key requirements, skills needed, and any notable aspects:

Job Title: ${job.job_title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}
Salary: ${job.salary_string || 'Not specified'}

Description:
${job.description || 'No description available'}

Provide a concise analysis in this format:
1. Role Summary (2-3 sentences)
2. Key Requirements (bullet points)
3. Required Skills (bullet points)
4. Notable Aspects (anything interesting about the role/company)`
            }]
        });

        res.json({
            analysis: message.content[0].text
        });
    } catch (error) {
        console.error('Claude analysis error:', error);
        res.status(500).json({ error: 'Failed to analyze job' });
    }
});

// Claude AI - Generate cover letter
app.post('/api/ai/cover-letter', async (req, res) => {
    if (!anthropic) {
        return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const { job, userProfile } = req.body;
    if (!job) {
        return res.status(400).json({ error: 'Job data required' });
    }

    try {
        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            messages: [{
                role: 'user',
                content: `Generate a professional cover letter for this job:

Job Title: ${job.job_title}
Company: ${job.company}
Location: ${job.location || 'Not specified'}

Job Description:
${job.description || 'No description available'}

${userProfile ? `
Candidate Profile:
${userProfile}
` : 'Write a general cover letter that can be customized.'}

Write a compelling, professional cover letter that:
- Addresses the specific requirements mentioned in the job posting
- Highlights relevant experience and skills
- Shows enthusiasm for the role and company
- Is concise (3-4 paragraphs)`
            }]
        });

        res.json({
            coverLetter: message.content[0].text
        });
    } catch (error) {
        console.error('Claude cover letter error:', error);
        res.status(500).json({ error: 'Failed to generate cover letter' });
    }
});

// Claude AI - Match jobs to profile
app.post('/api/ai/match-jobs', async (req, res) => {
    if (!anthropic) {
        return res.status(500).json({ error: 'Claude API key not configured' });
    }

    const { jobs, userProfile } = req.body;
    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
        return res.status(400).json({ error: 'Jobs array required' });
    }
    if (!userProfile) {
        return res.status(400).json({ error: 'User profile required' });
    }

    try {
        const jobSummaries = jobs.map((job, i) =>
            `${i + 1}. ${job.job_title} at ${job.company} (${job.location || 'Location N/A'})`
        ).join('\n');

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 2048,
            messages: [{
                role: 'user',
                content: `Given this candidate profile and list of jobs, rank the jobs by fit and explain why:

Candidate Profile:
${userProfile}

Jobs:
${jobSummaries}

For each job, provide:
1. Match score (1-10)
2. Brief explanation of fit
3. Any concerns or gaps

Rank from best to worst fit.`
            }]
        });

        res.json({
            matching: message.content[0].text
        });
    } catch (error) {
        console.error('Claude matching error:', error);
        res.status(500).json({ error: 'Failed to match jobs' });
    }
});

// Catch-all for SPA
app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`JobFeeder server running on port ${PORT}`);
    console.log(`Theirstack API: ${THEIRSTACK_API_KEY ? 'Configured' : 'Not configured'}`);
    console.log(`Claude API: ${ANTHROPIC_API_KEY ? 'Configured' : 'Not configured'}`);
});
