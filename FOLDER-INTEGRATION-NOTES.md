# Folder Integration Notes

## How It Works

The folder integration connects the job search page to the PostgreSQL-backed folders API.

### Key Features

1. **Automatic Folder Loading**
   - Folders are loaded from the API when the page loads
   - Fresh data is fetched each time you open the folder picker
   - No need to refresh the page to see new folders

2. **Seamless Integration**
   - Click the "+ folder icon" on any job card
   - Folder picker modal opens with all your folders
   - Folders loaded from PostgreSQL database
   - Same interface, now with cloud storage

3. **Add Job Flow**
   ```
   Click "+ Folder" → Folders reload from API → Modal shows folders →
   Select folder → Job added to PostgreSQL → Enrichment starts →
   Success message → Modal closes
   ```

### What Happens When You Add a Job

1. **Frontend:** User clicks folder icon
2. **API Call:** `showFolderPicker()` reloads folders from `/api/folders`
3. **Display:** Modal shows all folders with checkboxes
4. **Selection:** User selects a folder
5. **API Call:** `POST /api/folders/:id/jobs` with job data
6. **Backend:**
   - Job added to database
   - Company record created (if new)
   - Enrichment automatically triggered
7. **Frontend:**
   - Success notification shown
   - Folders reloaded
   - Job card updated with folder indicator
   - Modal closes

### Folder Display in Search Results

Each job card shows:
- **No folders:** "+ folder icon" button
- **In folders:** "+ folder icon" with count badge
- Hover shows which folders contain the job

### Integration Points

**Files:**
- `app.js` - Original job search logic (existing)
- `app-folder-integration.js` - API integration layer (new)
- `index.html` - Loads both scripts (updated)

**Functions Overridden:**
- `loadJobFolders()` → Loads from API instead of localStorage
- `createNewFolder()` → Creates via API
- `addJobToFolder()` → Adds via API with enrichment
- `showFolderPicker()` → Reloads folders before showing

**Fallback:**
- If API fails, falls back to localStorage
- Preserves functionality even if backend is down
- Alerts user if API integration failed

### Folder Data Format

**API Response:**
```json
{
  "id": 1,
  "name": "GTM Engineer - UK",
  "description": "Campaign description",
  "status": "company_enriched",
  "job_count": 15,
  "prospect_count": 250,
  "selected_prospect_count": 45,
  "created_at": "2024-02-04T10:00:00Z",
  "updated_at": "2024-02-04T11:30:00Z"
}
```

**Converted to Local Format:**
```javascript
{
  id: "1",
  name: "GTM Engineer - UK",
  description: "Campaign description",
  jobs: [], // Loaded separately when needed
  createdAt: "2024-02-04T10:00:00Z",
  updatedAt: "2024-02-04T11:30:00Z",
  status: "company_enriched",
  job_count: 15,
  prospect_count: 250
}
```

### Debugging

**Check if folders are loading:**
1. Open browser console (F12)
2. Look for: "Loaded X folders from API"
3. Or: "Folder integration loaded - using PostgreSQL API"

**Check API connection:**
```javascript
// In browser console
fetch('/api/folders').then(r => r.json()).then(console.log)
```

**Check folder picker data:**
```javascript
// In browser console
console.log(jobFolders)
```

### Common Issues

**1. Folders not showing in picker**
- Check browser console for errors
- Verify API is running (`/api/health`)
- Check DATABASE_URL is configured
- Try refreshing the page

**2. Job not being added**
- Check console for error messages
- Verify folder exists in database
- Check API endpoint is accessible
- Review server logs

**3. Enrichment not starting**
- Normal - runs in background
- Check notifications after 5-10 minutes
- Open folder to see background tasks
- Review `/api/tasks` endpoint

### Testing

**Test the integration:**

1. **Load folders:**
   ```javascript
   // Open console on job search page
   // Should see: "Loaded X folders from API"
   ```

2. **Create folder:**
   - Go to Folders page
   - Create "Test Folder"
   - Go back to search
   - Click folder icon on a job
   - Should see "Test Folder" in the list

3. **Add job:**
   - Select the folder
   - Should see success message
   - Job should be added
   - Check Folders page to verify

4. **Verify enrichment:**
   - Wait 5 minutes
   - Check notifications
   - Should see "Company Enrichment Complete"

### Performance

**Folder Loading:**
- Initial load: When page loads
- Refresh: When picker opens (ensures fresh data)
- Cache: Not cached (always fresh from API)

**Why Reload on Picker Open?**
- Ensures you see folders created in other tabs
- Reflects real-time changes
- Small API call (~1KB, <100ms)
- Better UX than stale data

### Future Improvements

- [ ] Cache folders with TTL (reduce API calls)
- [ ] WebSocket for real-time updates
- [ ] Optimistic UI updates
- [ ] Batch job additions
- [ ] Drag-and-drop to folders
- [ ] Folder creation from picker

---

**Questions?** Check [README.md](README.md) or [API-DOCUMENTATION.md](API-DOCUMENTATION.md)
