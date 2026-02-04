# Function Overrides for API Integration

## Overview

The `app-folder-integration.js` script overrides several functions from `app.js` to use the PostgreSQL API instead of localStorage. This ensures all folder operations go through the database.

## Overridden Functions

### 1. `loadJobFolders()`
**Original**: Loads folders from `localStorage`
**Override**: Loads folders from `/api/folders` endpoint
**Why**: Ensures folders are always loaded from PostgreSQL database

### 2. `createNewFolder()`
**Original**: Creates folder in `localStorage`
**Override**: Creates folder via `POST /api/folders`
**Why**: Persists folders to database, triggers company enrichment

### 3. `addJobToFolder(index, folderId)`
**Original**: Adds job to folder in `localStorage`
**Override**: Adds job via `POST /api/folders/:id/jobs`
**Why**: Persists jobs to database, triggers enrichment, avoids `renderFolders()` error

### 4. `showFolderPicker(index)`
**Original**: Shows modal with folders from memory
**Override**: Reloads folders from API first, then shows modal
**Why**: Ensures picker shows fresh data from database

### 5. `quickCreateFolder(jobIndex)`
**Original**: Creates folder locally and adds job
**Override**: Creates folder via API, then adds job via API
**Why**: Prevents `renderFolders()` error when creating from modal

### 6. `toggleJobInFolder(index, folderId)`
**Original**: Toggles job in/out of folder locally
**Override**: Only supports adding via API (removal not implemented)
**Why**: Prevents `renderFolders()` error when clicking folder in picker

## Why Override These Functions?

### Problem 1: localStorage vs PostgreSQL
Without overrides, app.js would continue using localStorage while we want everything in PostgreSQL.

### Problem 2: Element Not Found Errors
Original functions call `renderFolders()` and `updateTotalJobsCount()` which expect DOM elements that only exist on `folders.html`, not on `index.html` (job search page).

**Error**: `Cannot set properties of null (setting 'innerHTML')`
**Cause**: `elements.foldersList` is null on job search page
**Solution**: Override functions to skip rendering when elements don't exist

### Problem 3: Stale Data
Without reloading folders on picker open, users see outdated folder lists.

## Override Implementation

### Initialization Timing

```javascript
// Wait for app.js to define functions
const checkAndInit = () => {
    if (typeof window.showFolderPicker === 'function') {
        initializeFolderIntegration();
    } else {
        setTimeout(checkAndInit, 10);
    }
};
checkAndInit();
```

### Saving Originals

```javascript
window._originalCreateNewFolder = window.createNewFolder;
window._originalAddJobToFolder = window.addJobToFolder;
// ... etc
```

### Replacing with API Versions

```javascript
window.createNewFolder = createNewFolderAPI;
window.addJobToFolder = addJobToFolderAPI;
// ... etc
```

## Function Call Flow

### Before Override (localStorage)
```
User clicks "+ folder"
  → showFolderPicker(index)
  → Reads jobFolders from memory
  → User selects folder
  → addJobToFolder(index, folderId)
  → Updates localStorage
  → Calls renderFolders() ❌ ERROR on job search page
```

### After Override (API)
```
User clicks "+ folder"
  → showFolderPickerWithAPI(index)
  → await loadJobFolders() from API
  → window._originalShowFolderPicker(index)
  → User selects folder
  → addJobToFolderAPI(index, folderId)
  → POST /api/folders/:id/jobs
  → await loadJobFolders() to refresh
  → Conditionally calls renderFolders() only if elements exist ✓
```

## Conditional Rendering

All API functions check for element existence before rendering:

```javascript
if (typeof renderFolders === 'function' && document.getElementById('foldersList')) {
    renderFolders();
}
```

This prevents errors on pages that don't have the sidebar elements.

## Functions NOT Overridden

These functions are only used on `folders.html` and don't need API integration:

- `deleteFolder()` - Only on folders page
- `exportFolder()` - Only on folders page
- `showSavedJobDetails()` - Only on folders page
- `removeJobFromFolder()` - Only on folders page

## Fallback Strategy

All API functions have fallback to localStorage on error:

```javascript
try {
    // API call
} catch (error) {
    console.error('Error:', error);
    alert('API failed. Using local storage as fallback.');
    window._originalFunction(); // Call original
}
```

## Testing Checklist

- [ ] Folders load from API on page load
- [ ] Clicking "+ folder" shows fresh folders from API
- [ ] Creating folder via quick create uses API
- [ ] Adding job to folder uses API
- [ ] No "Cannot set properties of null" errors
- [ ] Success notifications appear
- [ ] Company enrichment starts in background
- [ ] Folders page still works normally

## Debugging

Check console for these messages:

```
[Folder Integration] Initializing...
[Folder Integration] Original functions saved: {...}
[Folder Integration] API integration active
Loaded X folders from API
```

If you see `renderFolders @ app.js:1035` in error stack, an override is missing or bypassed.

---

**Status**: ✅ All critical functions overridden
**Last Updated**: 2024-02-04
