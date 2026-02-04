# Migration Guide: localStorage to PostgreSQL

## Overview

JobFeeder now uses PostgreSQL for folder storage instead of browser localStorage. This guide explains the automatic migration process.

---

## Automatic Migration

### What Happens Automatically

When you first load the job search page after updating to the new version:

1. **Detection:** System checks if you have folders in localStorage
2. **Migration:** Automatically migrates all folders to PostgreSQL
3. **Jobs Transfer:** All jobs within folders are also migrated
4. **Notification:** Shows success message when complete
5. **One-time:** Migration only runs once (tracked via flag)

### Migration Flow

```
Page Load
    ↓
Check if already migrated?
    ↓ NO
Get folders from localStorage
    ↓
For each folder:
    → Create folder in PostgreSQL
    → For each job in folder:
        → Add job to PostgreSQL folder
        → Trigger company enrichment
    ↓
Mark migration complete
    ↓
Show success notification
```

### What Gets Migrated

**Folder Data:**
- Folder name
- Creation date
- All jobs in the folder

**Job Data:**
- Job title
- Company name
- Location
- Salary
- Description
- Job URL
- Posted date
- Full company data
- Raw job data

**What Happens After Migration:**
- Company enrichment starts automatically for each job
- Folders appear in PostgreSQL database
- Folders load from API instead of localStorage
- Old localStorage data remains (as backup)

---

## Migration Details

### Timeline

**Immediate (< 1 second):**
- Check localStorage for folders
- Decide if migration needed

**During Migration (varies by folder count):**
- ~200ms per folder
- ~100ms per job
- For 5 folders with 50 jobs total: ~5-10 seconds

**After Migration:**
- Company enrichment runs in background (5-30 minutes)
- Folders immediately available in UI
- Can start using right away

### Migration Status

**Check if migration is needed:**
```javascript
// In browser console
localStorage.getItem('jobfeeder_folders_migrated')
// Returns: null (not migrated) or "true" (migrated)
```

**Check local folders:**
```javascript
// In browser console
JSON.parse(localStorage.getItem('jobfeeder_job_folders'))
// Returns: Array of folders or null
```

**Check migrated folders:**
```javascript
// In browser console
fetch('/api/folders').then(r => r.json()).then(console.log)
// Returns: Array of folders from PostgreSQL
```

---

## Manual Migration

If automatic migration fails or you want to re-migrate:

### Option 1: Browser Console

```javascript
// Force re-migration
window.resetFolderMigration();
// Then reload page
location.reload();
```

### Option 2: Manual API Calls

For each folder in localStorage:

```javascript
// Get local folders
const localFolders = JSON.parse(localStorage.getItem('jobfeeder_job_folders'));

// For each folder
for (const folder of localFolders) {
    // Create folder
    const response = await fetch('/api/folders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: folder.name,
            description: 'Manually migrated'
        })
    });

    const newFolder = await response.json();
    console.log('Created:', newFolder);

    // Add jobs to folder
    for (const job of folder.jobs) {
        await fetch(`/api/folders/${newFolder.id}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: job.id,
                job_title: job.job_title,
                company: job.company,
                domain: job.company_object?.domain || job.company.toLowerCase() + '.com',
                location: job.location,
                // ... other job fields
            })
        });
    }
}
```

---

## Troubleshooting

### Migration Not Running

**Symptoms:**
- No migration notification appears
- Folders not showing in PostgreSQL
- localStorage folders still being used

**Solutions:**

1. **Check if already migrated:**
   ```javascript
   localStorage.getItem('jobfeeder_folders_migrated')
   ```
   If "true", migration already ran. To re-run:
   ```javascript
   window.resetFolderMigration()
   location.reload()
   ```

2. **Check browser console:**
   - Look for errors
   - Check for "[Migration]" log messages
   - Review any API errors

3. **Verify API is running:**
   ```javascript
   fetch('/api/health').then(r => r.json()).then(console.log)
   ```

### Migration Failed Partially

**Symptoms:**
- Some folders migrated, others didn't
- Error messages in console
- Notification shows "X failed"

**Solutions:**

1. **Check migration results:**
   - Look at notification message
   - Review console errors
   - Identify which folders failed

2. **Re-migrate failed folders:**
   ```javascript
   // Get local folders
   const local = JSON.parse(localStorage.getItem('jobfeeder_job_folders'));

   // Get migrated folders
   const migrated = await fetch('/api/folders').then(r => r.json());

   // Find missing folders
   const missing = local.filter(l =>
       !migrated.some(m => m.name === l.name)
   );

   console.log('Missing folders:', missing);
   // Manually create these
   ```

3. **Check API errors:**
   - Review server logs
   - Check database connectivity
   - Verify API endpoints work

### Duplicate Folders

**Symptoms:**
- Folders appear twice
- Migration ran multiple times

**Solutions:**

1. **Delete duplicates via UI:**
   - Go to Folders page
   - Delete duplicate folders
   - Keep the one with jobs

2. **Delete via API:**
   ```javascript
   // Get all folders
   const folders = await fetch('/api/folders').then(r => r.json());

   // Find duplicates
   const seen = new Set();
   const duplicates = folders.filter(f => {
       if (seen.has(f.name)) return true;
       seen.add(f.name);
       return false;
   });

   // Delete duplicates
   for (const dup of duplicates) {
       await fetch(`/api/folders/${dup.id}`, { method: 'DELETE' });
   }
   ```

3. **Prevent future duplicates:**
   - Migration only runs once (flag prevents re-run)
   - If you reset flag, expect duplicates

---

## Data Safety

### Backup Strategy

**localStorage data is NOT deleted** after migration:
- Original folders remain in browser
- Acts as backup
- Can be used to verify migration
- Can re-migrate if needed

**To backup localStorage folders:**
```javascript
// Export to JSON
const folders = localStorage.getItem('jobfeeder_job_folders');
const blob = new Blob([folders], { type: 'application/json' });
const url = URL.createObjectURL(blob);
const a = document.createElement('a');
a.href = url;
a.download = 'jobfeeder-folders-backup.json';
a.click();
```

**To restore from backup:**
```javascript
// After loading the JSON file
const folders = [...]; // Your backup data
localStorage.setItem('jobfeeder_job_folders', JSON.stringify(folders));
localStorage.removeItem('jobfeeder_folders_migrated');
location.reload(); // Triggers re-migration
```

### PostgreSQL Backup

**Automatic:**
- Render.com provides automatic backups (paid plans)
- Daily snapshots

**Manual:**
```bash
# From command line with Render CLI or psql
pg_dump $DATABASE_URL > backup.sql

# Restore
psql $DATABASE_URL < backup.sql
```

---

## Migration Checklist

### Before Migration
- [ ] Backup localStorage folders (optional but recommended)
- [ ] Verify API is running (`/api/health`)
- [ ] Check database connection
- [ ] Note how many folders you have

### During Migration
- [ ] Watch browser console for progress
- [ ] Don't close the tab
- [ ] Wait for completion notification
- [ ] Note any error messages

### After Migration
- [ ] Verify folders appear in Folders page
- [ ] Check folder count matches
- [ ] Try adding a job to migrated folder
- [ ] Wait for company enrichment notifications
- [ ] Export a folder to verify jobs are intact

### Verification
```javascript
// Get local count
const local = JSON.parse(localStorage.getItem('jobfeeder_job_folders'));
console.log('Local folders:', local?.length || 0);

// Get PostgreSQL count
fetch('/api/folders')
    .then(r => r.json())
    .then(folders => console.log('PostgreSQL folders:', folders.length));

// Should match!
```

---

## FAQ

### Will I lose my folders?
No. localStorage data remains as backup. Migration creates copies in PostgreSQL.

### What if migration fails?
You can re-run it. Use `window.resetFolderMigration()` then reload.

### Can I use both localStorage and PostgreSQL?
No. After migration, system only uses PostgreSQL. But localStorage data remains for backup.

### How do I know if migration succeeded?
- Success notification appears
- Folders show in Folders page
- Console shows "[Migration] Complete!"
- API returns folders

### What happens to jobs in folders?
All jobs are migrated with their full data. Company enrichment starts automatically.

### Can I migrate again?
Yes, but it will create duplicates. Only do this if first migration failed.

### How long does migration take?
- Empty folders: < 1 second
- 5 folders with 10 jobs each: ~5 seconds
- 20 folders with 100 jobs total: ~30 seconds

### What if I clear localStorage after migration?
No problem! Folders are now in PostgreSQL. Clearing localStorage won't affect them.

### Can I export before migrating?
Yes! Use the backup strategy above to save your localStorage folders first.

---

## Support

### Migration Issues

**If migration fails:**
1. Check browser console for errors
2. Verify API connectivity
3. Check server logs
4. Try manual migration
5. Contact support with error messages

**Contact:**
- Email: support@insightstap.com
- Include: Error messages, browser console logs, number of folders

---

## Technical Details

### Migration Script

**File:** `public/migrate-folders.js`

**Key Functions:**
- `migrateLocalStorageFolders()` - Main migration
- `resetMigration()` - Reset flag to re-migrate
- `showMigrationNotification()` - User notification

**Migration Flag:**
- Key: `jobfeeder_folders_migrated`
- Value: `"true"` when complete
- Location: Browser localStorage

**Execution:**
- Runs 1 second after page load
- Waits for API to be ready
- Runs once per browser
- Can be manually triggered

### Error Handling

**Folder Creation Errors:**
- Logs to console
- Continues with next folder
- Reports in final results

**Job Addition Errors:**
- Logs to console
- Continues with next job
- Doesn't stop folder creation

**Network Errors:**
- Retries not implemented (single attempt)
- Can manually re-run if needed
- Error details in console

### Performance

**Rate Limiting:**
- 100ms delay between jobs
- 200ms delay between folders
- Prevents API overload
- Allows monitoring progress

**Batch Size:**
- All folders migrated in one session
- All jobs per folder migrated sequentially
- No pagination needed

---

**Migration Status:** ✅ Automatic and Safe

Your folders will be seamlessly migrated to PostgreSQL on first load!
