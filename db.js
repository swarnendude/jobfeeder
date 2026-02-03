import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DB_PATH = join(__dirname, 'jobfeeder.db');

let db = null;

export async function initializeDatabase() {
    const SQL = await initSqlJs();

    // Load existing database or create new one
    if (existsSync(DB_PATH)) {
        const buffer = readFileSync(DB_PATH);
        db = new SQL.Database(buffer);
        console.log('Loaded existing database from', DB_PATH);
    } else {
        db = new SQL.Database();
        console.log('Created new database');
    }

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            domain TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            theirstack_data TEXT,
            enriched_data TEXT,
            enrichment_status TEXT DEFAULT 'pending',
            enrichment_error TEXT,
            enrichment_attempts INTEGER DEFAULT 0,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now')),
            enriched_at TEXT
        )
    `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_companies_domain ON companies(domain)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(enrichment_status)`);

    saveDatabase();

    return new CompanyDatabase();
}

function saveDatabase() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        writeFileSync(DB_PATH, buffer);
    }
}

class CompanyDatabase {
    getCompany(domain) {
        const stmt = db.prepare('SELECT * FROM companies WHERE domain = ?');
        stmt.bind([domain]);

        if (stmt.step()) {
            const row = stmt.getAsObject();
            stmt.free();
            return {
                ...row,
                theirstack_data: row.theirstack_data ? JSON.parse(row.theirstack_data) : null,
                enriched_data: row.enriched_data ? JSON.parse(row.enriched_data) : null
            };
        }
        stmt.free();
        return null;
    }

    createCompany(domain, name, theirstackData) {
        db.run(
            `INSERT INTO companies (domain, name, theirstack_data, enrichment_status)
             VALUES (?, ?, ?, 'pending')`,
            [domain, name, JSON.stringify(theirstackData)]
        );
        saveDatabase();

        // Get the last inserted id
        const result = db.exec('SELECT last_insert_rowid() as id');
        return result[0]?.values[0]?.[0] || null;
    }

    companyExists(domain) {
        const stmt = db.prepare('SELECT 1 FROM companies WHERE domain = ?');
        stmt.bind([domain]);
        const exists = stmt.step();
        stmt.free();
        return exists;
    }

    saveEnrichedData(domain, enrichedData) {
        db.run(
            `UPDATE companies
             SET enriched_data = ?, enrichment_status = 'completed',
                 enriched_at = datetime('now'), updated_at = datetime('now')
             WHERE domain = ?`,
            [JSON.stringify(enrichedData), domain]
        );
        saveDatabase();
    }

    updateEnrichmentStatus(domain, status) {
        db.run(
            `UPDATE companies
             SET enrichment_status = ?, updated_at = datetime('now')
             WHERE domain = ?`,
            [status, domain]
        );
        saveDatabase();
    }

    recordEnrichmentError(domain, errorMessage) {
        db.run(
            `UPDATE companies
             SET enrichment_status = 'failed', enrichment_error = ?,
                 enrichment_attempts = enrichment_attempts + 1,
                 updated_at = datetime('now')
             WHERE domain = ?`,
            [errorMessage, domain]
        );
        saveDatabase();
    }

    incrementAttempts(domain) {
        db.run(
            `UPDATE companies
             SET enrichment_attempts = enrichment_attempts + 1,
                 updated_at = datetime('now')
             WHERE domain = ?`,
            [domain]
        );
        saveDatabase();
    }

    resetForRetry(domain) {
        db.run(
            `UPDATE companies
             SET enrichment_status = 'pending', enrichment_error = NULL,
                 updated_at = datetime('now')
             WHERE domain = ?`,
            [domain]
        );
        saveDatabase();
    }

    getPendingCompanies(limit = 10) {
        const results = db.exec(
            `SELECT * FROM companies
             WHERE enrichment_status = 'pending'
             ORDER BY created_at ASC
             LIMIT ${limit}`
        );

        if (!results[0]) return [];

        const columns = results[0].columns;
        return results[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => {
                obj[col] = row[i];
            });
            obj.theirstack_data = obj.theirstack_data ? JSON.parse(obj.theirstack_data) : null;
            obj.enriched_data = obj.enriched_data ? JSON.parse(obj.enriched_data) : null;
            return obj;
        });
    }

    getFailedCompanies(limit = 10) {
        const results = db.exec(
            `SELECT * FROM companies
             WHERE enrichment_status = 'failed'
             AND enrichment_attempts < 3
             ORDER BY updated_at ASC
             LIMIT ${limit}`
        );

        if (!results[0]) return [];

        const columns = results[0].columns;
        return results[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => {
                obj[col] = row[i];
            });
            obj.theirstack_data = obj.theirstack_data ? JSON.parse(obj.theirstack_data) : null;
            obj.enriched_data = obj.enriched_data ? JSON.parse(obj.enriched_data) : null;
            return obj;
        });
    }

    getAllCompanies() {
        const results = db.exec('SELECT * FROM companies ORDER BY updated_at DESC');

        if (!results[0]) return [];

        const columns = results[0].columns;
        return results[0].values.map(row => {
            const obj = {};
            columns.forEach((col, i) => {
                obj[col] = row[i];
            });
            obj.theirstack_data = obj.theirstack_data ? JSON.parse(obj.theirstack_data) : null;
            obj.enriched_data = obj.enriched_data ? JSON.parse(obj.enriched_data) : null;
            return obj;
        });
    }

    getStats() {
        const results = db.exec(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN enrichment_status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN enrichment_status = 'processing' THEN 1 ELSE 0 END) as processing,
                SUM(CASE WHEN enrichment_status = 'completed' THEN 1 ELSE 0 END) as completed,
                SUM(CASE WHEN enrichment_status = 'failed' THEN 1 ELSE 0 END) as failed
            FROM companies
        `);

        if (!results[0]) {
            return { total: 0, pending: 0, processing: 0, completed: 0, failed: 0 };
        }

        const [total, pending, processing, completed, failed] = results[0].values[0];
        return { total, pending, processing, completed, failed };
    }
}
