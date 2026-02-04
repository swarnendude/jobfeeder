# API Documentation

Complete API reference for JobFeeder backend endpoints.

## Base URL

```
http://localhost:3000/api
```

## Authentication

Currently, no authentication is required (single-user system). In production, consider adding API key authentication.

---

## Folders API

### List All Folders

**GET** `/folders`

Returns all folders with job counts and prospect counts.

**Response:**
```json
[
  {
    "id": 1,
    "name": "GTM Engineer - UK/US",
    "description": "Campaign for GTM roles",
    "status": "company_enriched",
    "created_at": "2024-02-04T10:30:00Z",
    "updated_at": "2024-02-04T11:45:00Z",
    "job_count": 25,
    "prospect_count": 450,
    "selected_prospect_count": 75
  }
]
```

**Status Values:**
- `jobs_added` - Jobs have been added to folder
- `company_enriched` - All companies enriched
- `prospects_collected` - Prospects have been collected
- `prospects_selected` - Prospects have been selected
- `ready_for_outreach` - Contact info enriched

---

### Create Folder

**POST** `/folders`

**Request Body:**
```json
{
  "name": "GTM Engineer - UK/US",
  "description": "Campaign targeting GTM roles in UK and US markets"
}
```

**Response:**
```json
{
  "id": 1,
  "name": "GTM Engineer - UK/US",
  "description": "Campaign targeting GTM roles in UK and US markets",
  "status": "jobs_added",
  "created_at": "2024-02-04T10:30:00Z",
  "updated_at": "2024-02-04T10:30:00Z"
}
```

---

### Get Folder Details

**GET** `/folders/:id`

Returns complete folder information including jobs, prospects, and background tasks.

**Response:**
```json
{
  "folder": {
    "id": 1,
    "name": "GTM Engineer - UK/US",
    "status": "prospects_collected",
    "created_at": "2024-02-04T10:30:00Z"
  },
  "jobs": [
    {
      "id": 1,
      "job_title": "GTM Engineer",
      "company_name": "Acme Corp",
      "company_domain": "acme.com",
      "location": "London, UK",
      "country": "UK",
      "salary_string": "$100k-$150k",
      "created_at": "2024-02-04T10:35:00Z"
    }
  ],
  "prospects": [
    {
      "id": 1,
      "name": "John Smith",
      "title": "VP of Sales",
      "company_name": "Acme Corp",
      "company_domain": "acme.com",
      "priority": "high",
      "ai_score": 0.85,
      "selected": true,
      "email": "john@acme.com",
      "phone": "+44 20 1234 5678",
      "linkedin_url": "https://linkedin.com/in/johnsmith"
    }
  ],
  "tasks": [
    {
      "id": 1,
      "task_type": "company_enrichment",
      "status": "completed",
      "progress": 25,
      "total": 25,
      "created_at": "2024-02-04T10:35:00Z",
      "completed_at": "2024-02-04T11:00:00Z"
    }
  ]
}
```

---

### Add Job to Folder

**POST** `/folders/:id/jobs`

Adds a job to the folder and automatically triggers company enrichment.

**Request Body:**
```json
{
  "id": "theirstack_123456",
  "job_title": "GTM Engineer",
  "company": "Acme Corp",
  "domain": "acme.com",
  "location": "London, UK",
  "country": "UK",
  "salary_string": "$100k-$150k",
  "description": "Looking for a GTM engineer...",
  "url": "https://jobs.acme.com/gtm-engineer",
  "posted_date": "2024-02-01",
  "employee_count": 250,
  "theirstack_company_data": { /* full company object */ },
  "raw_data": { /* full job object */ }
}
```

**Response:**
```json
{
  "job": {
    "id": 1,
    "folder_id": 1,
    "job_title": "GTM Engineer",
    "company_name": "Acme Corp",
    "company_domain": "acme.com"
  },
  "message": "Job added successfully. Company enrichment started in background."
}
```

---

### Collect Prospects

**POST** `/folders/:id/collect-prospects`

Starts prospect collection for all companies in the folder.

**Response:**
```json
{
  "status": "processing",
  "message": "Prospect collection started in background"
}
```

**Process:**
1. Searches SignalHire for prospects at each company
2. Filters by job location
3. Applies company size rules (founders vs VPs)
4. Ranks with AI scoring
5. Limits to 20 per company
6. Sends notification when complete

---

### Auto-Select Prospects

**POST** `/folders/:id/auto-select`

Automatically selects top 2-3 prospects per company based on AI scores and priority.

**Response:**
```json
{
  "status": "success",
  "message": "Top 2-3 prospects per company have been auto-selected"
}
```

---

### Enrich Contact Information

**POST** `/folders/:id/enrich-contacts`

Enriches selected prospects with email addresses and phone numbers using SignalHire.

**Response:**
```json
{
  "status": "processing",
  "message": "Contact enrichment started in background"
}
```

**Error Response (Daily Limit Reached):**
```json
{
  "error": "Daily email collection limit reached (150/150). Try again tomorrow."
}
```

---

### Delete Folder

**DELETE** `/folders/:id`

Deletes a folder and all associated jobs and prospects.

**Response:**
```json
{
  "status": "success",
  "message": "Folder deleted"
}
```

---

## Prospects API

### Update Prospect Selection

**PATCH** `/prospects/:id/select`

Manually toggle prospect selection.

**Request Body:**
```json
{
  "selected": true
}
```

**Response:**
```json
{
  "status": "success"
}
```

---

## Notifications API

### Get Unread Notifications

**GET** `/notifications/unread`

Returns all unread notifications.

**Response:**
```json
[
  {
    "id": 1,
    "type": "enrichment_complete",
    "title": "Company Enrichment Complete",
    "message": "Acme Corp has been enriched successfully",
    "link": "/folders/1",
    "read": false,
    "created_at": "2024-02-04T11:00:00Z"
  }
]
```

**Notification Types:**
- `enrichment_complete` - Company enrichment succeeded
- `enrichment_failed` - Company enrichment failed
- `prospects_collected` - Prospect collection completed
- `prospects_selected` - Prospects auto-selected
- `contacts_enriched` - Contact enrichment completed
- `folder_ready` - Folder ready for next stage

---

### Get All Notifications

**GET** `/notifications`

Returns recent notifications (last 50).

**Query Parameters:**
- None

**Response:** Same as unread, but includes read notifications.

---

### Mark Notification as Read

**PATCH** `/notifications/:id/read`

Marks a single notification as read.

**Response:**
```json
{
  "status": "success"
}
```

---

### Mark All Notifications as Read

**POST** `/notifications/read-all`

Marks all notifications as read.

**Response:**
```json
{
  "status": "success"
}
```

---

## Knowledge Base API

### Get All Knowledge Entries

**GET** `/knowledge`

Returns all knowledge base entries.

**Response:**
```json
[
  {
    "id": 1,
    "type": "company_profile",
    "title": "InsightsTap Company Profile",
    "content": "Full text content...",
    "metadata": {
      "url": "https://insightstap.com",
      "scraped_at": "2024-02-04T10:00:00Z"
    },
    "created_at": "2024-02-04T10:00:00Z"
  }
]
```

**Knowledge Types:**
- `company_profile` - Your company profile
- `user_profile` - Personal profiles
- `document` - Additional documents
- `guideline` - Outreach guidelines

---

### Add Knowledge Entry

**POST** `/knowledge`

**Request Body:**
```json
{
  "type": "document",
  "title": "Product Case Study",
  "content": "Full case study text...",
  "metadata": {
    "source": "manual",
    "tags": ["case-study", "success-story"]
  }
}
```

**Response:**
```json
{
  "id": 5,
  "type": "document",
  "title": "Product Case Study",
  "created_at": "2024-02-04T12:00:00Z"
}
```

---

### Update Knowledge Entry

**PATCH** `/knowledge/:id`

**Request Body:**
```json
{
  "content": "Updated content...",
  "metadata": {
    "updated_reason": "Added new data"
  }
}
```

**Response:**
```json
{
  "status": "success"
}
```

---

## Background Tasks API

### Get All Tasks

**GET** `/tasks`

Returns recent background tasks (last 100).

**Response:**
```json
[
  {
    "id": 1,
    "task_type": "company_enrichment",
    "folder_id": 1,
    "company_id": 5,
    "status": "completed",
    "progress": 1,
    "total": 1,
    "result": {
      "status": "completed",
      "data": { /* enriched data */ }
    },
    "error_message": null,
    "started_at": "2024-02-04T10:35:00Z",
    "completed_at": "2024-02-04T10:37:00Z",
    "created_at": "2024-02-04T10:35:00Z"
  }
]
```

**Task Types:**
- `company_enrichment` - Company website scraping and AI extraction
- `prospect_collection` - SignalHire search and ranking
- `contact_enrichment` - Email/phone lookup

**Task Statuses:**
- `pending` - Queued, not started
- `processing` - Currently running
- `completed` - Successfully finished
- `failed` - Error occurred

---

### Get Active Tasks

**GET** `/tasks/active`

Returns only currently running or pending tasks.

**Response:** Same format as `/tasks` but filtered for active tasks.

---

## Companies API (Legacy)

### List All Companies

**GET** `/companies`

Returns all enriched companies and statistics.

**Response:**
```json
{
  "companies": [
    {
      "id": 1,
      "domain": "acme.com",
      "name": "Acme Corp",
      "enrichment_status": "completed",
      "enriched_data": {
        "tagline": "Building the future",
        "description": "Company description...",
        "founders": [...],
        "leadership_team": [...],
        "target_contacts": [...]
      },
      "employee_count": 250,
      "enriched_at": "2024-02-04T10:37:00Z"
    }
  ],
  "stats": {
    "total": 50,
    "pending": 5,
    "processing": 2,
    "completed": 40,
    "failed": 3
  }
}
```

---

### Get Company Details

**GET** `/companies/:domain`

Returns detailed information for a specific company.

**Response:**
```json
{
  "id": 1,
  "domain": "acme.com",
  "name": "Acme Corp",
  "enrichment_status": "completed",
  "enriched_data": {
    "tagline": "Building the future of work",
    "description": "Acme Corp is a B2B SaaS company...",
    "products": ["Product A", "Product B"],
    "founders": [
      {
        "name": "Jane Doe",
        "title": "CEO & Co-Founder",
        "linkedin_url": "https://linkedin.com/in/janedoe"
      }
    ],
    "leadership_team": [...],
    "business_model": "B2B SaaS",
    "target_market": "Mid-market companies",
    "company_summary": "Brief summary...",
    "target_contacts": [
      {
        "name": "John Smith",
        "title": "VP of Sales",
        "department": "Sales",
        "priority": "high",
        "relevance": "Key decision maker for GTM tools"
      }
    ],
    "gtm_opportunity_assessment": "Strong fit because..."
  },
  "employee_count": 250,
  "enriched_at": "2024-02-04T10:37:00Z"
}
```

---

## Job Search API (Theirstack Proxy)

### Search Jobs

**POST** `/jobs/search`

Proxies to Theirstack API with caching (4 hours).

**Request Body:**
```json
{
  "job_title_pattern_or": ["GTM Engineer", "Go-to-Market Engineer"],
  "location_pattern_or": ["UK", "United States"],
  "company_employee_count_min": 50,
  "company_employee_count_max": 500,
  "limit": 50,
  "offset": 0
}
```

**Response:**
```json
{
  "total": 150,
  "data": [
    {
      "id": "theirstack_123456",
      "job_title": "GTM Engineer",
      "company": "Acme Corp",
      "company_domain": "acme.com",
      "location": "London, UK",
      "salary_string": "$100k-$150k",
      "description": "Full job description...",
      "url": "https://jobs.acme.com/gtm-engineer",
      "date_posted": "2024-02-01",
      "company_object": {
        "name": "Acme Corp",
        "domain": "acme.com",
        "employee_count": 250,
        "industry": "Software",
        "logo": "https://logo.acme.com/logo.png"
      }
    }
  ],
  "_cached": false
}
```

---

## Health Check

### Check API Health

**GET** `/health`

Returns status of all services.

**Response:**
```json
{
  "status": "ok",
  "theirstack": true,
  "claude": true,
  "gemini": true,
  "signalhire": true,
  "database": true,
  "cache": {
    "validEntries": 15,
    "expiredEntries": 3,
    "totalEntries": 18
  }
}
```

---

## Cache Management

### Clear Cache

**DELETE** `/cache`

Clears all cached job search results.

**Response:**
```json
{
  "message": "Cache cleared",
  "entriesCleared": 18
}
```

---

### Get Cache Info

**GET** `/cache`

Returns cache statistics.

**Response:**
```json
{
  "validEntries": 15,
  "expiredEntries": 3,
  "totalEntries": 18,
  "ttlHours": 4
}
```

---

## Error Responses

All endpoints may return these error responses:

### 400 Bad Request
```json
{
  "error": "Folder name is required"
}
```

### 404 Not Found
```json
{
  "error": "Folder not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Failed to create folder"
}
```

### 503 Service Unavailable
```json
{
  "error": "Database not initialized"
}
```

---

## Rate Limits

### SignalHire API
- 600 requests per minute
- Implemented: 200ms delay between calls
- Daily email collection: 150 max

### Theirstack API
- Depends on your plan
- Implemented: 4-hour cache to reduce calls

### Database
- No limits (PostgreSQL)
- Connection pooling enabled

---

## Webhook Support (Future)

Currently not implemented. Could be added for:
- Task completion notifications
- Real-time updates to external systems
- CRM integration callbacks

---

## Best Practices

### 1. Polling for Task Completion
Instead of waiting synchronously, poll the folder or tasks endpoint:

```javascript
async function waitForEnrichment(folderId) {
  while (true) {
    const folder = await fetch(`/api/folders/${folderId}`).then(r => r.json());
    if (folder.folder.status === 'company_enriched') {
      break;
    }
    await sleep(5000); // Check every 5 seconds
  }
}
```

### 2. Error Handling
Always check for errors:

```javascript
const response = await fetch('/api/folders', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'My Folder' })
});

if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error || 'Request failed');
}

const data = await response.json();
```

### 3. Batch Operations
Add multiple jobs before triggering prospect collection:

```javascript
// Add 10 jobs
for (const job of jobs) {
  await fetch(`/api/folders/${folderId}/jobs`, {
    method: 'POST',
    body: JSON.stringify(job)
  });
}

// Wait for all enrichments
await waitForFolderStatus(folderId, 'company_enriched');

// Collect all prospects at once
await fetch(`/api/folders/${folderId}/collect-prospects`, {
  method: 'POST'
});
```

---

## Changelog

### v1.0.0 (2024-02-04)
- Initial release
- All endpoints documented above
- PostgreSQL database
- Background task processing
- Notification system
- Knowledge base

---

## Support

For API issues or questions:
- Check server logs for errors
- Review TESTING-CHECKLIST.md
- Check database for task errors
- Email: support@insightstap.com
