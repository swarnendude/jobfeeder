// Migration Script: Sync localStorage folders to PostgreSQL
// This runs automatically on page load to migrate existing folders

(function() {
    'use strict';

const MIGRATION_KEY = 'jobfeeder_folders_migrated';
const JOB_FOLDERS_KEY = 'jobfeeder_job_folders';

async function migrateLocalStorageFolders() {
    // Check if API endpoint exists (only available with PostgreSQL server)
    try {
        const testResponse = await fetch('/api/folders');
        if (!testResponse.ok && testResponse.status === 404) {
            console.log('[Migration] Folder API not available (using SQLite server). Migration skipped.');
            return { migrated: false, reason: 'api_not_available' };
        }
    } catch (e) {
        console.log('[Migration] Could not reach folder API. Migration skipped.');
        return { migrated: false, reason: 'api_error' };
    }

    // Check if migration already done
    if (localStorage.getItem(MIGRATION_KEY) === 'true') {
        console.log('[Migration] Folders already migrated to PostgreSQL');
        return { migrated: false, reason: 'already_done' };
    }

    // Get folders from localStorage
    const localFoldersJson = localStorage.getItem(JOB_FOLDERS_KEY);
    if (!localFoldersJson) {
        console.log('[Migration] No local folders found to migrate');
        localStorage.setItem(MIGRATION_KEY, 'true');
        return { migrated: false, reason: 'no_local_folders' };
    }

    let localFolders;
    try {
        localFolders = JSON.parse(localFoldersJson);
    } catch (e) {
        console.error('[Migration] Failed to parse local folders:', e);
        localStorage.setItem(MIGRATION_KEY, 'true');
        return { migrated: false, reason: 'parse_error' };
    }

    if (!Array.isArray(localFolders) || localFolders.length === 0) {
        console.log('[Migration] No folders to migrate');
        localStorage.setItem(MIGRATION_KEY, 'true');
        return { migrated: false, reason: 'empty_folders' };
    }

    console.log(`[Migration] Found ${localFolders.length} folders in localStorage`);
    console.log('[Migration] Starting migration to PostgreSQL...');

    const results = {
        total: localFolders.length,
        migrated: 0,
        failed: 0,
        errors: []
    };

    // Migrate each folder
    for (const folder of localFolders) {
        try {
            // Create folder in PostgreSQL
            const folderResponse = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: folder.name,
                    description: `Migrated from localStorage on ${new Date().toISOString()}`
                })
            });

            if (!folderResponse.ok) {
                throw new Error(`Failed to create folder: ${folderResponse.status}`);
            }

            const newFolder = await folderResponse.json();
            console.log(`[Migration] Created folder: ${folder.name} (ID: ${newFolder.id})`);

            // Migrate jobs in this folder
            if (folder.jobs && Array.isArray(folder.jobs) && folder.jobs.length > 0) {
                console.log(`[Migration] Migrating ${folder.jobs.length} jobs in folder "${folder.name}"`);

                for (const job of folder.jobs) {
                    try {
                        await fetch(`/api/folders/${newFolder.id}/jobs`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                id: job.id,
                                job_title: job.job_title,
                                company: job.company,
                                domain: job.company_object?.domain || extractDomainFromName(job.company),
                                location: job.location,
                                country: extractCountryFromLocation(job.location),
                                salary_string: job.salary_string,
                                description: job.description,
                                url: job.url,
                                posted_date: job.date_posted,
                                employee_count: job.company_object?.employee_count,
                                theirstack_company_data: job.company_object,
                                raw_data: job
                            })
                        });

                        console.log(`[Migration] Added job: ${job.job_title} at ${job.company}`);

                        // Small delay to avoid overwhelming the API
                        await delay(100);
                    } catch (jobError) {
                        console.error(`[Migration] Failed to migrate job: ${job.job_title}`, jobError);
                        results.errors.push(`Job: ${job.job_title} - ${jobError.message}`);
                    }
                }
            }

            results.migrated++;
        } catch (error) {
            console.error(`[Migration] Failed to migrate folder: ${folder.name}`, error);
            results.failed++;
            results.errors.push(`Folder: ${folder.name} - ${error.message}`);
        }

        // Delay between folders
        await delay(200);
    }

    // Mark migration as complete
    localStorage.setItem(MIGRATION_KEY, 'true');

    console.log('[Migration] Complete!');
    console.log(`[Migration] Results: ${results.migrated} migrated, ${results.failed} failed`);

    // Show notification to user
    if (results.migrated > 0) {
        showMigrationNotification(results);
    }

    return results;
}

function extractDomainFromName(companyName) {
    return companyName.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20) + '.com';
}

function extractCountryFromLocation(location) {
    if (!location) return null;

    const countries = [
        'US', 'USA', 'United States',
        'UK', 'United Kingdom',
        'CA', 'Canada',
        'AU', 'Australia',
        'DE', 'Germany',
        'FR', 'France',
        'IN', 'India',
        'SG', 'Singapore',
        'NL', 'Netherlands'
    ];

    for (const country of countries) {
        if (location.toUpperCase().includes(country.toUpperCase())) {
            if (country === 'United States' || country === 'USA') return 'US';
            if (country === 'United Kingdom') return 'UK';
            return country.length === 2 ? country : country.substring(0, 2).toUpperCase();
        }
    }

    return null;
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showMigrationNotification(results) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 20px 25px;
        border-radius: 8px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        z-index: 10000;
        max-width: 400px;
        animation: slideIn 0.3s ease-out;
    `;

    let message = `<strong>✓ Migration Complete!</strong><br>`;
    message += `Migrated ${results.migrated} folder${results.migrated !== 1 ? 's' : ''} from local storage to PostgreSQL.<br>`;

    if (results.failed > 0) {
        message += `<br><small style="color: #ffeb3b;">${results.failed} folder${results.failed !== 1 ? 's' : ''} failed to migrate.</small>`;
    }

    message += `<br><small>Your folders are now safely stored in the cloud!</small>`;

    notification.innerHTML = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 8000);
}

// Reset migration (for testing only - uncomment to force re-migration)
function resetMigration() {
    localStorage.removeItem(MIGRATION_KEY);
    console.log('[Migration] Reset complete. Reload page to re-migrate.');
}

// Auto-run migration on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(migrateLocalStorageFolders, 1000); // Wait 1 second for API to be ready
    });
} else {
    setTimeout(migrateLocalStorageFolders, 1000);
}

// Export for manual use
window.migrateLocalStorageFolders = migrateLocalStorageFolders;
window.resetFolderMigration = resetMigration;

console.log('[Migration] Folder migration script loaded');
console.log('[Migration] Run window.resetFolderMigration() to force re-migration (for testing)');

})(); // End of IIFE
