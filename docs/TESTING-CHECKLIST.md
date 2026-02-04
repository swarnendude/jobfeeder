# Testing Checklist

Use this checklist to verify the JobFeeder system is working correctly.

## ✅ Prerequisites

- [ ] Node.js 18+ installed
- [ ] npm install completed successfully
- [ ] .env file created with API keys
- [ ] DATABASE_URL is configured
- [ ] PostgreSQL database is accessible

## ✅ Database Setup

```bash
npm start
```

- [ ] Server starts without errors
- [ ] Console shows "PostgreSQL database connected successfully"
- [ ] Console shows "PostgreSQL tables created successfully"
- [ ] Console shows all API keys configured status

## ✅ Knowledge Base Setup

```bash
npm run setup-kb
```

- [ ] Script connects to database
- [ ] Scrapes insightstap.com successfully
- [ ] Scrapes swarnendu.de successfully
- [ ] Scrapes riteshosta.com successfully
- [ ] Adds guideline successfully
- [ ] Completes without errors

## ✅ Health Check

Open browser and test:

```
http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "theirstack": true,
  "claude": true,
  "gemini": true,
  "signalhire": true,
  "database": true,
  "cache": {...}
}
```

- [ ] All services show `true` status
- [ ] No errors in response

## ✅ Job Search (Frontend)

1. Open http://localhost:3000
   - [ ] Page loads without errors
   - [ ] Navigation shows: Jobs, Folders, Companies
   - [ ] API status shows connected (green dots)

2. Search for Jobs
   - [ ] Enter "GTM Engineer" in job title
   - [ ] Click "Search Jobs"
   - [ ] Results appear (if Theirstack has data)
   - [ ] Job cards show company info
   - [ ] Folder icon (+) appears on each job

3. Test Cache
   - [ ] Search again with same query
   - [ ] Results show "Cached" badge
   - [ ] Results load instantly

## ✅ Folder Management

1. Create Folder
   - [ ] Go to http://localhost:3000/folders.html
   - [ ] Enter folder name: "Test Campaign"
   - [ ] Click "Create Folder"
   - [ ] Folder appears in grid
   - [ ] Status shows "Jobs Added"

2. Add Job to Folder
   - [ ] Go back to job search
   - [ ] Click "+ folder icon" on any job
   - [ ] Select "Test Campaign" folder
   - [ ] Success message appears
   - [ ] Folder icon changes (shows folder count)

3. Check Folder Details
   - [ ] Go back to folders page
   - [ ] Open "Test Campaign" folder
   - [ ] Job appears in folder
   - [ ] Company domain is shown
   - [ ] Close modal

## ✅ Company Enrichment

1. Wait for Automatic Enrichment
   - [ ] Check notifications (bell icon in folders page)
   - [ ] Wait 1-3 minutes
   - [ ] Notification appears: "Company Enrichment Complete"
   - [ ] Folder status changes to "Company Enriched"

2. Verify Enrichment Data
   - [ ] Open folder details
   - [ ] Check background tasks section
   - [ ] Task shows "company_enrichment" completed
   - [ ] No error messages

3. Check Company Data (Optional)
   ```
   GET http://localhost:3000/api/companies
   ```
   - [ ] Company appears in list
   - [ ] `enrichment_status` is "completed"
   - [ ] `enriched_data` contains structured data

## ✅ Prospect Collection

1. Trigger Prospect Collection
   - [ ] Click "Collect Prospects" button on folder
   - [ ] Confirmation appears
   - [ ] Click OK
   - [ ] Success message appears
   - [ ] Folder closes

2. Wait for Collection
   - [ ] Check notifications
   - [ ] Wait 2-5 minutes (depends on company count)
   - [ ] Notification appears: "Prospect Collection Complete"
   - [ ] Folder status changes to "Prospects Collected"

3. Verify Prospects
   - [ ] Open folder details
   - [ ] Prospects section appears
   - [ ] Table shows prospects grouped by company
   - [ ] Each prospect has: name, title, priority
   - [ ] AI scores are visible
   - [ ] Checkboxes are present

## ✅ Auto-Selection

1. Auto-Select Prospects
   - [ ] Click "Auto-Select Top 2-3 per Company" button
   - [ ] Confirmation dialog appears
   - [ ] Click OK
   - [ ] Success message appears
   - [ ] Folder status changes to "Prospects Selected"

2. Verify Selection
   - [ ] Checkboxes for top prospects are checked
   - [ ] 2-3 prospects selected per company
   - [ ] Higher priority prospects are selected
   - [ ] Higher AI scores are selected

3. Manual Toggle (Optional)
   - [ ] Click checkbox to deselect a prospect
   - [ ] Click checkbox to select a prospect
   - [ ] Changes are saved (no error)

## ✅ Contact Enrichment

1. Enrich Contacts
   - [ ] Click "Get Email Addresses" button
   - [ ] Confirmation dialog shows count
   - [ ] Click OK
   - [ ] Success message appears

2. Wait for Enrichment
   - [ ] Check notifications
   - [ ] Wait 2-5 minutes
   - [ ] Notification appears: "Contact Enrichment Complete"
   - [ ] Folder status changes to "Ready for Outreach"

3. Verify Emails
   - [ ] Open folder details
   - [ ] Contact column shows email addresses
   - [ ] Some prospects may show "Not found" (normal)
   - [ ] Enriched count matches notification

## ✅ Export

1. Export Prospects
   - [ ] Click "Export Prospects" button
   - [ ] CSV file downloads
   - [ ] File name includes folder name
   - [ ] File opens in spreadsheet

2. Verify CSV Content
   - [ ] Headers: Name, Title, Company, Email, Phone, LinkedIn, Priority, AI Score
   - [ ] All selected prospects are included
   - [ ] Email addresses are present
   - [ ] Data is properly formatted

## ✅ Notifications

1. Check Notification System
   - [ ] Bell icon shows unread count
   - [ ] Click bell icon
   - [ ] Dropdown shows notifications
   - [ ] Each notification has title and message
   - [ ] Click notification marks as read
   - [ ] Badge count decreases

2. Mark All Read
   - [ ] Click "Mark all read" button
   - [ ] Badge disappears
   - [ ] All notifications marked as read

## ✅ Background Tasks

1. Check Task History
   ```
   GET http://localhost:3000/api/tasks
   ```
   - [ ] Returns list of recent tasks
   - [ ] Shows task type (enrichment, collection, etc.)
   - [ ] Shows status (completed, failed, processing)
   - [ ] Shows progress if applicable

2. Check Active Tasks
   ```
   GET http://localhost:3000/api/tasks/active
   ```
   - [ ] Returns currently running tasks
   - [ ] Empty if nothing is running

## ✅ Error Handling

1. Test Daily Email Limit
   - [ ] Create folder with 200 jobs (if available)
   - [ ] Collect and select 200 prospects
   - [ ] Try to enrich contacts
   - [ ] Error message about daily limit
   - [ ] Enrichment stops at 150 emails

2. Test Invalid Company
   - [ ] Manually add job with invalid domain
   - [ ] Enrichment should fail gracefully
   - [ ] Error message in background task
   - [ ] Folder can still progress

3. Test Network Failures
   - [ ] Disconnect internet briefly during enrichment
   - [ ] System should retry automatically
   - [ ] Check retry attempts in database
   - [ ] Eventually completes or fails gracefully

## ✅ Performance

1. Check Response Times
   - [ ] Job search: < 2 seconds (cached < 200ms)
   - [ ] Folder list: < 500ms
   - [ ] Folder details: < 1 second
   - [ ] Notifications: < 300ms

2. Check Resource Usage
   - [ ] Server memory stays under 500MB
   - [ ] No memory leaks over time
   - [ ] Database connections are properly closed
   - [ ] No zombie processes

## ✅ Cleanup

After testing:

1. Delete Test Data
   ```sql
   DELETE FROM prospects WHERE folder_id IN (SELECT id FROM folders WHERE name = 'Test Campaign');
   DELETE FROM jobs WHERE folder_id IN (SELECT id FROM folders WHERE name = 'Test Campaign');
   DELETE FROM folders WHERE name = 'Test Campaign';
   ```

2. Clear Notifications
   ```
   POST http://localhost:3000/api/notifications/read-all
   ```

3. Clear Cache
   ```
   DELETE http://localhost:3000/api/cache
   ```

## 🐛 Troubleshooting Failed Tests

### Server Won't Start
- Check DATABASE_URL format
- Verify PostgreSQL is running
- Check port 3000 is not in use
- Review .env file syntax

### Company Enrichment Fails
- Check GEMINI_API_KEY or ANTHROPIC_API_KEY
- Verify API key has credits
- Check company domain is accessible
- Review console logs for errors

### Prospect Collection Empty
- Check SIGNALHIRE_API_KEY
- Verify SignalHire has credits
- Check company name is correct
- Try different job titles

### Contact Enrichment Fails
- Check daily limit in email_collection_log
- Verify SignalHire API access
- Check prospect data has LinkedIn URLs
- Review error messages

### Frontend Not Loading
- Check server is running
- Clear browser cache
- Check browser console for errors
- Verify static files are served

## 📊 Test Results

Date: _____________

| Test Category | Status | Notes |
|--------------|--------|-------|
| Prerequisites | ☐ Pass | |
| Database Setup | ☐ Pass | |
| Knowledge Base | ☐ Pass | |
| Health Check | ☐ Pass | |
| Job Search | ☐ Pass | |
| Folder Management | ☐ Pass | |
| Company Enrichment | ☐ Pass | |
| Prospect Collection | ☐ Pass | |
| Auto-Selection | ☐ Pass | |
| Contact Enrichment | ☐ Pass | |
| Export | ☐ Pass | |
| Notifications | ☐ Pass | |
| Background Tasks | ☐ Pass | |
| Error Handling | ☐ Pass | |
| Performance | ☐ Pass | |

**Overall Status:** ☐ Pass  ☐ Fail

**Issues Found:**
_______________________________________
_______________________________________
_______________________________________

**Action Items:**
_______________________________________
_______________________________________
_______________________________________

---

**Tested By:** _____________
**Environment:** Development / Staging / Production
