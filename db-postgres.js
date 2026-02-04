import pg from 'pg';
const { Pool } = pg;

// PostgreSQL connection pool
let pool = null;

export async function initializePostgresDatabase(connectionUrl) {
    pool = new Pool({
        connectionString: connectionUrl,
        ssl: {
            rejectUnauthorized: false // Required for Render.com
        }
    });

    // Test connection
    try {
        await pool.query('SELECT NOW()');
        console.log('PostgreSQL database connected successfully');
    } catch (error) {
        console.error('Failed to connect to PostgreSQL:', error);
        throw error;
    }

    // Create all tables
    await createTables();

    // Run migrations for existing databases
    await runMigrations();

    return new PostgresDatabase();
}

async function createTables() {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Folders table (one folder per job)
        await client.query(`
            CREATE TABLE IF NOT EXISTS folders (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'jobs_added' CHECK (status IN ('jobs_added', 'company_enriched', 'prospects_collected', 'prospects_selected', 'ready_for_outreach')),
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Jobs table
        await client.query(`
            CREATE TABLE IF NOT EXISTS jobs (
                id SERIAL PRIMARY KEY,
                folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
                theirstack_job_id TEXT,
                job_title TEXT NOT NULL,
                company_name TEXT NOT NULL,
                company_domain TEXT NOT NULL,
                location TEXT,
                country TEXT,
                salary_string TEXT,
                description TEXT,
                job_url TEXT,
                posted_date TEXT,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(theirstack_job_id)
            )
        `);

        // Add company_id column if it doesn't exist (for existing databases)
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'jobs' AND column_name = 'company_id'
                ) THEN
                    ALTER TABLE jobs ADD COLUMN company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL;
                END IF;
            END $$;
        `);

        // Companies table (enriched company data)
        await client.query(`
            CREATE TABLE IF NOT EXISTS companies (
                id SERIAL PRIMARY KEY,
                domain TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                theirstack_data JSONB,
                enriched_data JSONB,
                enrichment_status TEXT DEFAULT 'pending' CHECK (enrichment_status IN ('pending', 'processing', 'completed', 'failed')),
                enrichment_error TEXT,
                enrichment_attempts INTEGER DEFAULT 0,
                employee_count INTEGER,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                enriched_at TIMESTAMP
            )
        `);

        // Prospects table (people to contact)
        await client.query(`
            CREATE TABLE IF NOT EXISTS prospects (
                id SERIAL PRIMARY KEY,
                folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                title TEXT,
                department TEXT,
                linkedin_url TEXT,
                email TEXT,
                phone TEXT,
                location TEXT,
                priority TEXT CHECK (priority IN ('high', 'medium', 'low')),
                relevance TEXT,
                ai_score DECIMAL(3,2), -- 0.00 to 1.00
                selected BOOLEAN DEFAULT FALSE,
                auto_selected BOOLEAN DEFAULT FALSE,
                signalhire_enriched BOOLEAN DEFAULT FALSE,
                raw_data JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Background tasks table
        await client.query(`
            CREATE TABLE IF NOT EXISTS background_tasks (
                id SERIAL PRIMARY KEY,
                task_type TEXT NOT NULL CHECK (task_type IN ('company_enrichment', 'prospect_collection', 'contact_enrichment')),
                folder_id INTEGER REFERENCES folders(id) ON DELETE CASCADE,
                company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
                status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
                progress INTEGER DEFAULT 0,
                total INTEGER,
                result JSONB,
                error_message TEXT,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Knowledge base table
        await client.query(`
            CREATE TABLE IF NOT EXISTS knowledge_base (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL CHECK (type IN ('company_profile', 'user_profile', 'document', 'guideline')),
                title TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Email collection tracking (for daily limit)
        await client.query(`
            CREATE TABLE IF NOT EXISTS email_collection_log (
                id SERIAL PRIMARY KEY,
                date DATE NOT NULL DEFAULT CURRENT_DATE,
                emails_collected INTEGER DEFAULT 0,
                UNIQUE(date)
            )
        `);

        // Notifications table
        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id SERIAL PRIMARY KEY,
                type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                link TEXT,
                read BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create indexes
        await client.query('CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_jobs_folder ON jobs(folder_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_jobs_domain ON jobs(company_domain)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(enrichment_status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_prospects_folder ON prospects(folder_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_prospects_company ON prospects(company_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_prospects_selected ON prospects(selected)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_status ON background_tasks(status)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_tasks_folder ON background_tasks(folder_id)');
        await client.query('CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read)');

        await client.query('COMMIT');
        console.log('PostgreSQL tables created successfully');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error creating tables:', error);
        throw error;
    } finally {
        client.release();
    }
}

async function runMigrations() {
    const client = await pool.connect();

    try {
        console.log('Running database migrations...');

        // Migration: Add updated_at column to background_tasks if it doesn't exist
        await client.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'background_tasks' AND column_name = 'updated_at'
                ) THEN
                    ALTER TABLE background_tasks ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
                    RAISE NOTICE 'Added updated_at column to background_tasks table';
                END IF;
            END $$;
        `);

        console.log('Database migrations completed successfully');
    } catch (error) {
        console.error('Error running migrations:', error);
        throw error;
    } finally {
        client.release();
    }
}

export class PostgresDatabase {
    // ===== FOLDER METHODS =====

    async createFolder(name, description = null) {
        const result = await pool.query(
            'INSERT INTO folders (name, description) VALUES ($1, $2) RETURNING *',
            [name, description]
        );
        return result.rows[0];
    }

    async getFolder(id) {
        const result = await pool.query('SELECT * FROM folders WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    async getAllFolders() {
        const result = await pool.query(`
            SELECT f.*,
                   COUNT(DISTINCT j.id) as job_count,
                   COUNT(DISTINCT p.id) as prospect_count,
                   COUNT(DISTINCT CASE WHEN p.selected = true THEN p.id END) as selected_prospect_count
            FROM folders f
            LEFT JOIN jobs j ON j.folder_id = f.id
            LEFT JOIN prospects p ON p.folder_id = f.id
            GROUP BY f.id
            ORDER BY f.updated_at DESC
        `);
        return result.rows;
    }

    async updateFolderStatus(id, status) {
        await pool.query(
            'UPDATE folders SET status = $1, updated_at = NOW() WHERE id = $2',
            [status, id]
        );
    }

    async deleteFolder(id) {
        await pool.query('DELETE FROM folders WHERE id = $1', [id]);
    }

    // ===== JOB METHODS =====

    async addJobToFolder(folderId, jobData) {
        // First, create or get the company
        let companyId = null;
        if (jobData.company_domain) {
            const company = await this.getOrCreateCompany(
                jobData.company_domain,
                jobData.company_name,
                jobData.company_data || null
            );
            companyId = company.id;
        }

        // Handle ON CONFLICT only if theirstack_job_id is provided
        const hasJobId = jobData.theirstack_job_id && jobData.theirstack_job_id !== null;
        const conflictClause = hasJobId
            ? 'ON CONFLICT (theirstack_job_id) DO UPDATE SET folder_id = EXCLUDED.folder_id, company_id = EXCLUDED.company_id'
            : '';

        const result = await pool.query(`
            INSERT INTO jobs (
                folder_id, company_id, theirstack_job_id, job_title, company_name, company_domain,
                location, country, salary_string, description, job_url, posted_date, raw_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ${conflictClause}
            RETURNING *
        `, [
            folderId,
            companyId,
            jobData.theirstack_job_id || null,
            jobData.job_title,
            jobData.company_name,
            jobData.company_domain,
            jobData.location || null,
            jobData.country || null,
            jobData.salary_string || null,
            jobData.description || null,
            jobData.job_url || null,
            jobData.posted_date || null,
            JSON.stringify(jobData.raw_data || {})
        ]);

        // Update folder timestamp and get folder name for logging
        const folderResult = await pool.query('SELECT name FROM folders WHERE id = $1', [folderId]);
        await pool.query('UPDATE folders SET updated_at = NOW() WHERE id = $1', [folderId]);

        const job = result.rows[0];
        const folderName = folderResult.rows[0]?.name || 'Unknown Folder';

        console.log(`✅ Job added: "${jobData.job_title}" at ${jobData.company_name} → Folder: "${folderName}" (ID: ${folderId})`);

        return job;
    }

    // Get or create a company by domain
    async getOrCreateCompany(domain, name, theirstackData = null) {
        // Check if company exists
        let result = await pool.query('SELECT * FROM companies WHERE domain = $1', [domain]);

        if (result.rows.length > 0) {
            return result.rows[0];
        }

        // Create new company
        const employeeCount = theirstackData?.employee_count || null;
        result = await pool.query(`
            INSERT INTO companies (domain, name, theirstack_data, employee_count)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (domain) DO UPDATE SET
                name = COALESCE(EXCLUDED.name, companies.name),
                theirstack_data = COALESCE(EXCLUDED.theirstack_data, companies.theirstack_data),
                employee_count = COALESCE(EXCLUDED.employee_count, companies.employee_count),
                updated_at = NOW()
            RETURNING *
        `, [domain, name, theirstackData ? JSON.stringify(theirstackData) : null, employeeCount]);

        console.log(`✅ Company created/updated: ${name} (${domain})`);
        return result.rows[0];
    }

    async getJobsByFolder(folderId) {
        const result = await pool.query(`
            SELECT j.*, c.id as linked_company_id, c.name as linked_company_name,
                   c.domain as linked_company_domain, c.enrichment_status,
                   c.theirstack_data as company_theirstack_data, c.enriched_data as company_enriched_data
            FROM jobs j
            LEFT JOIN companies c ON j.company_id = c.id
            WHERE j.folder_id = $1
            ORDER BY j.created_at DESC
        `, [folderId]);
        return result.rows;
    }

    async getJob(id) {
        const result = await pool.query('SELECT * FROM jobs WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    async removeJobFromFolder(folderId, jobId) {
        // jobId can be either the database id (integer) or theirstack_job_id (text)
        // Try to parse as integer for id comparison, always use string for theirstack_job_id
        const jobIdStr = jobId.toString();
        const jobIdInt = parseInt(jobIdStr, 10);
        const isNumeric = !isNaN(jobIdInt);

        let result;
        if (isNumeric) {
            // Can match by either integer id or text theirstack_job_id
            result = await pool.query(
                'DELETE FROM jobs WHERE folder_id = $1 AND (id = $2 OR theirstack_job_id = $3) RETURNING *',
                [folderId, jobIdInt, jobIdStr]
            );
        } else {
            // Only match by text theirstack_job_id
            result = await pool.query(
                'DELETE FROM jobs WHERE folder_id = $1 AND theirstack_job_id = $2 RETURNING *',
                [folderId, jobIdStr]
            );
        }

        if (result.rows.length > 0) {
            // Update folder timestamp
            await pool.query('UPDATE folders SET updated_at = NOW() WHERE id = $1', [folderId]);
            console.log(`✅ Job removed from folder ${folderId}`);
        }

        return result.rows[0] || null;
    }

    async getJobFolderMappings() {
        // Returns mapping of theirstack_job_id to folder info for all jobs
        const result = await pool.query(`
            SELECT j.theirstack_job_id, j.folder_id, f.name as folder_name
            FROM jobs j
            JOIN folders f ON j.folder_id = f.id
            WHERE j.theirstack_job_id IS NOT NULL
        `);
        return result.rows;
    }

    // ===== COMPANY METHODS =====

    // Get unique companies associated with jobs in a folder
    async getCompaniesByFolder(folderId) {
        const result = await pool.query(`
            SELECT DISTINCT c.*
            FROM companies c
            INNER JOIN jobs j ON j.company_id = c.id
            WHERE j.folder_id = $1
            ORDER BY c.name
        `, [folderId]);
        return result.rows;
    }

    async createCompany(domain, name, theirstackData = null, employeeCount = null) {
        const result = await pool.query(`
            INSERT INTO companies (domain, name, theirstack_data, employee_count)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (domain) DO UPDATE SET
                theirstack_data = EXCLUDED.theirstack_data,
                employee_count = EXCLUDED.employee_count,
                updated_at = NOW()
            RETURNING *
        `, [domain, name, JSON.stringify(theirstackData), employeeCount]);
        return result.rows[0];
    }

    async getCompany(domain) {
        const result = await pool.query('SELECT * FROM companies WHERE domain = $1', [domain]);
        return result.rows[0] || null;
    }

    async companyExists(domain) {
        const result = await pool.query('SELECT 1 FROM companies WHERE domain = $1', [domain]);
        return result.rows.length > 0;
    }

    async saveEnrichedData(domain, enrichedData) {
        await pool.query(`
            UPDATE companies
            SET enriched_data = $1,
                enrichment_status = 'completed',
                enriched_at = NOW(),
                updated_at = NOW()
            WHERE domain = $2
        `, [JSON.stringify(enrichedData), domain]);
    }

    async updateEnrichmentStatus(domain, status) {
        await pool.query(
            'UPDATE companies SET enrichment_status = $1, updated_at = NOW() WHERE domain = $2',
            [status, domain]
        );
    }

    async recordEnrichmentError(domain, errorMessage) {
        await pool.query(`
            UPDATE companies
            SET enrichment_status = 'failed',
                enrichment_error = $1,
                enrichment_attempts = enrichment_attempts + 1,
                updated_at = NOW()
            WHERE domain = $2
        `, [errorMessage, domain]);
    }

    async incrementAttempts(domain) {
        await pool.query(
            'UPDATE companies SET enrichment_attempts = enrichment_attempts + 1, updated_at = NOW() WHERE domain = $1',
            [domain]
        );
    }

    async resetForRetry(domain) {
        await pool.query(`
            UPDATE companies
            SET enrichment_status = 'pending',
                enrichment_error = NULL,
                updated_at = NOW()
            WHERE domain = $1
        `, [domain]);
    }

    async getPendingCompanies(limit = 10) {
        const result = await pool.query(`
            SELECT * FROM companies
            WHERE enrichment_status = 'pending'
            ORDER BY created_at ASC
            LIMIT $1
        `, [limit]);
        return result.rows;
    }

    async getFailedCompanies(limit = 10) {
        const result = await pool.query(`
            SELECT * FROM companies
            WHERE enrichment_status = 'failed'
            AND enrichment_attempts < 3
            ORDER BY updated_at ASC
            LIMIT $1
        `, [limit]);
        return result.rows;
    }

    async getAllCompanies() {
        const result = await pool.query('SELECT * FROM companies ORDER BY updated_at DESC');
        return result.rows;
    }

    async getStats() {
        const result = await pool.query(`
            SELECT
                COUNT(*) as total,
                COUNT(CASE WHEN enrichment_status = 'pending' THEN 1 END) as pending,
                COUNT(CASE WHEN enrichment_status = 'processing' THEN 1 END) as processing,
                COUNT(CASE WHEN enrichment_status = 'completed' THEN 1 END) as completed,
                COUNT(CASE WHEN enrichment_status = 'failed' THEN 1 END) as failed
            FROM companies
        `);
        return result.rows[0];
    }

    // ===== PROSPECT METHODS =====

    async createProspect(prospectData) {
        const result = await pool.query(`
            INSERT INTO prospects (
                folder_id, company_id, name, title, department, linkedin_url,
                email, phone, location, priority, relevance, ai_score, raw_data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            RETURNING *
        `, [
            prospectData.folder_id,
            prospectData.company_id,
            prospectData.name,
            prospectData.title || null,
            prospectData.department || null,
            prospectData.linkedin_url || null,
            prospectData.email || null,
            prospectData.phone || null,
            prospectData.location || null,
            prospectData.priority || 'medium',
            prospectData.relevance || null,
            prospectData.ai_score || null,
            JSON.stringify(prospectData.raw_data || {})
        ]);
        return result.rows[0];
    }

    async getProspectsByFolder(folderId) {
        const result = await pool.query(`
            SELECT p.*, c.name as company_name, c.domain as company_domain
            FROM prospects p
            JOIN companies c ON c.id = p.company_id
            WHERE p.folder_id = $1
            ORDER BY c.name, p.priority DESC, p.ai_score DESC
        `, [folderId]);
        return result.rows;
    }

    async getProspectsByCompany(companyId) {
        const result = await pool.query(
            'SELECT * FROM prospects WHERE company_id = $1 ORDER BY priority DESC, ai_score DESC',
            [companyId]
        );
        return result.rows;
    }

    async updateProspectSelection(id, selected, autoSelected = false) {
        await pool.query(
            'UPDATE prospects SET selected = $1, auto_selected = $2, updated_at = NOW() WHERE id = $3',
            [selected, autoSelected, id]
        );
    }

    async updateProspectContact(id, email, phone, signalhireEnriched = true) {
        await pool.query(
            'UPDATE prospects SET email = $1, phone = $2, signalhire_enriched = $3, updated_at = NOW() WHERE id = $4',
            [email, phone, signalhireEnriched, id]
        );
    }

    async getSelectedProspects(folderId) {
        const result = await pool.query(`
            SELECT p.*, c.name as company_name, c.domain as company_domain, c.enriched_data
            FROM prospects p
            JOIN companies c ON c.id = p.company_id
            WHERE p.folder_id = $1 AND p.selected = true
            ORDER BY c.name, p.priority DESC
        `, [folderId]);
        return result.rows;
    }

    // ===== BACKGROUND TASK METHODS =====

    async createTask(taskType, folderId, companyId = null, total = null) {
        const result = await pool.query(`
            INSERT INTO background_tasks (task_type, folder_id, company_id, total)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [taskType, folderId, companyId, total]);
        return result.rows[0];
    }

    async updateTaskStatus(id, status, progress = null, errorMessage = null) {
        const updates = ['status = $1', 'updated_at = NOW()'];
        const values = [status];
        let paramIndex = 1;

        if (status === 'processing' && progress === 0) {
            updates.push('started_at = NOW()');
        }

        if (status === 'completed' || status === 'failed') {
            updates.push('completed_at = NOW()');
        }

        if (progress !== null) {
            paramIndex++;
            updates.push(`progress = $${paramIndex}`);
            values.push(progress);
        }

        if (errorMessage !== null) {
            paramIndex++;
            updates.push(`error_message = $${paramIndex}`);
            values.push(errorMessage);
        }

        // Add id as the last parameter
        paramIndex++;
        values.push(id);

        await pool.query(
            `UPDATE background_tasks SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
            values
        );
    }

    async updateTaskResult(id, result) {
        await pool.query(
            'UPDATE background_tasks SET result = $1 WHERE id = $2',
            [JSON.stringify(result), id]
        );
    }

    async getTask(id) {
        const result = await pool.query('SELECT * FROM background_tasks WHERE id = $1', [id]);
        return result.rows[0] || null;
    }

    async getTasksByFolder(folderId) {
        const result = await pool.query(
            'SELECT * FROM background_tasks WHERE folder_id = $1 ORDER BY created_at DESC',
            [folderId]
        );
        return result.rows;
    }

    async getActiveTasks() {
        const result = await pool.query(
            "SELECT * FROM background_tasks WHERE status IN ('pending', 'processing') ORDER BY created_at ASC"
        );
        return result.rows;
    }

    async getRecentTasks(limit = 20) {
        const result = await pool.query(
            'SELECT * FROM background_tasks ORDER BY created_at DESC LIMIT $1',
            [limit]
        );
        return result.rows;
    }

    // ===== KNOWLEDGE BASE METHODS =====

    async addKnowledge(type, title, content, metadata = null) {
        const result = await pool.query(`
            INSERT INTO knowledge_base (type, title, content, metadata)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [type, title, content, JSON.stringify(metadata)]);
        return result.rows[0];
    }

    async updateKnowledge(id, content, metadata = null) {
        await pool.query(
            'UPDATE knowledge_base SET content = $1, metadata = $2, updated_at = NOW() WHERE id = $3',
            [content, JSON.stringify(metadata), id]
        );
    }

    async getKnowledgeByType(type) {
        const result = await pool.query(
            'SELECT * FROM knowledge_base WHERE type = $1 ORDER BY created_at DESC',
            [type]
        );
        return result.rows;
    }

    async getAllKnowledge() {
        const result = await pool.query('SELECT * FROM knowledge_base ORDER BY type, created_at DESC');
        return result.rows;
    }

    // ===== EMAIL COLLECTION LIMIT METHODS =====

    async getTodayEmailCount() {
        const result = await pool.query(
            'SELECT emails_collected FROM email_collection_log WHERE date = CURRENT_DATE'
        );
        return result.rows[0]?.emails_collected || 0;
    }

    async incrementEmailCount(count = 1) {
        await pool.query(`
            INSERT INTO email_collection_log (date, emails_collected)
            VALUES (CURRENT_DATE, $1)
            ON CONFLICT (date)
            DO UPDATE SET emails_collected = email_collection_log.emails_collected + $1
        `, [count]);
    }

    async canCollectEmails(count = 1, dailyLimit = 150) {
        const currentCount = await this.getTodayEmailCount();
        return currentCount + count <= dailyLimit;
    }

    // ===== NOTIFICATION METHODS =====

    async createNotification(type, title, message, link = null) {
        const result = await pool.query(`
            INSERT INTO notifications (type, title, message, link)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `, [type, title, message, link]);
        return result.rows[0];
    }

    async getUnreadNotifications() {
        const result = await pool.query(
            'SELECT * FROM notifications WHERE read = false ORDER BY created_at DESC'
        );
        return result.rows;
    }

    async markNotificationRead(id) {
        await pool.query('UPDATE notifications SET read = true WHERE id = $1', [id]);
    }

    async markAllNotificationsRead() {
        await pool.query('UPDATE notifications SET read = true WHERE read = false');
    }

    async getRecentNotifications(limit = 20) {
        const result = await pool.query(
            'SELECT * FROM notifications ORDER BY created_at DESC LIMIT $1',
            [limit]
        );
        return result.rows;
    }
}

export async function closeDatabase() {
    if (pool) {
        await pool.end();
        console.log('PostgreSQL connection closed');
    }
}
