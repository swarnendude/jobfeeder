# Folder Picker Debug Guide

## Issue: Folder picker popup not showing folder list

### How to Debug

1. **Open the app and browser console (F12)**

2. **Check script loading:**
   - You should see: `Folder integration loaded - using PostgreSQL API`
   - You should see: `[Folder Integration] Initializing...`
   - You should see: `[Folder Integration] Original functions saved:`

3. **Create a test folder:**
   - Go to Folders page (http://localhost:3000/folders.html)
   - Create a folder called "Test Folder"
   - You should see it in the list

4. **Go back to job search:**
   - Search for any jobs
   - Click the "+ folder icon" on a job

5. **Check console logs:**
   - Should see: `[Folder Integration] Opening folder picker for job index: X`
   - Should see: `[Folder Integration] Loading folders from API...`
   - Should see: `Loaded X folders from API`
   - Should see: `[Folder Integration] Folders loaded: X`
   - Should see: `[Folder Integration] Folder names: ["Test Folder"]`
   - Should see: `[Folder Integration] Calling original showFolderPicker`

6. **Check the modal:**
   - Modal should open
   - Should show "Add to Folder" header
   - Should show job title
   - Should show list of folders with checkboxes
   - Each folder should show job count

### Common Issues

#### Issue 1: "Original showFolderPicker not available"

**Cause:** Integration script loaded before app.js defined the function

**Fix:** Already implemented - script now waits 100ms for app.js to load

**Verify:**
```javascript
// In console
window._originalShowFolderPicker
// Should show: function showFolderPicker(index) { ... }
```

#### Issue 2: Folders show 0 jobs

**Cause:** API returns `job_count` but original function expects `jobs.length`

**Fix:** Already implemented - creates array with correct length

**Verify:**
```javascript
// In console
jobFolders
// Each folder should have: { jobs: Array(X), job_count: X }
```

#### Issue 3: No folders loaded

**Cause:** API not returning folders

**Fix:** Create folders first, or check API

**Verify:**
```javascript
// In console
fetch('/api/folders').then(r => r.json()).then(console.log)
// Should show array of folders
```

#### Issue 4: Modal shows but empty

**Cause:** `jobFolders` array is empty

**Fix:** Check if folders actually loaded

**Verify:**
```javascript
// In console
jobFolders
// Should show array with folders
```

### Manual Test Steps

**Full test:**

1. Start server: `npm start`
2. Open http://localhost:3000
3. Open browser console (F12)
4. Go to Folders page
5. Create "Test Folder 1"
6. Create "Test Folder 2"
7. Go back to Jobs page
8. Search for "Engineer"
9. Click "+ folder" on first job
10. **Verify:** Modal opens
11. **Verify:** Shows both folders
12. **Verify:** Can click on a folder
13. **Verify:** Job gets added
14. **Verify:** Success notification
15. **Verify:** Modal closes

### Console Commands for Testing

```javascript
// Check if integration loaded
console.log('Integration loaded:', !!window._originalShowFolderPicker);

// Check folders
console.log('Folders:', jobFolders);

// Manually trigger folder load
loadJobFolders().then(() => console.log('Loaded:', jobFolders.length));

// Manually open picker (job index 0)
showFolderPicker(0);

// Check API
fetch('/api/folders')
    .then(r => r.json())
    .then(folders => console.log('API folders:', folders));

// Force re-initialize
initializeFolderIntegration();
```

### Expected Console Output

When clicking "+ folder" on a job:

```
[Folder Integration] Opening folder picker for job index: 0
[Folder Integration] Current jobFolders before reload: []
[Folder Integration] Loading folders from API...
Loaded 2 folders from API
[Folder Integration] After reload - jobFolders: [{...}, {...}]
[Folder Integration] Folders loaded: 2
[Folder Integration] Folder names: ["Test Folder 1", "Test Folder 2"]
[Folder Integration] First folder details: {id: "1", name: "Test Folder 1", jobs: Array(5), ...}
[Folder Integration] window.jobFolders: [{...}, {...}]
[Folder Integration] typeof jobFolders: object
[Folder Integration] Calling original showFolderPicker
[Folder Integration] jobFolders just before calling: [{...}, {...}]
[Folder Integration] jobFolders.length: 2
[Folder Integration] Array.isArray(jobFolders): true
[Folder Integration] Original showFolderPicker called
[Folder Integration] Modal should now be visible
```

Then the modal should open with both folders listed.

### If Still Not Working

1. **Clear browser cache:**
   - Ctrl+Shift+Delete
   - Clear everything
   - Reload page

2. **Check file loading:**
   - View page source
   - Verify all three scripts are loaded:
     - `<script src="app.js"></script>`
     - `<script src="app-folder-integration.js"></script>`
     - `<script src="migrate-folders.js"></script>`

3. **Check for JavaScript errors:**
   - Console should have no red errors
   - If errors exist, report them

4. **Try incognito mode:**
   - Eliminates cache/extension issues
   - Fresh start

5. **Restart server:**
   ```bash
   # Stop server (Ctrl+C)
   npm start
   ```

### Success Criteria

✅ Console shows folders loaded
✅ Console shows calling original function
✅ Modal opens
✅ Folders are listed in modal
✅ Can select a folder
✅ Job gets added
✅ Success notification appears
✅ Modal closes automatically

---

**If you've verified all the above and it still doesn't work, provide:**
1. Console log output
2. Network tab (F12 → Network)
3. Any error messages
4. Screenshots of the issue
