# Project Structure

Overview of the JobFeeder codebase organization and architecture.

## Directory Structure

```
jobfeeder/
├── public/                          # Frontend files (served statically)
│   ├── index.html                   # Job search page (main entry)
│   ├── app.js                       # Job search logic (~1500 lines)
│   ├── app-folder-integration.js    # Search-to-folders API integration
│   ├── folders.html                 # Folder management page
│   ├── folders.js                   # Folder/prospect management (~550 lines)
│   ├── companies.html               # Company enrichment page (legacy)
│   ├── companies.js                 # Company management (legacy)
│   └── styles.css                   # All styles (~1500 lines)
│
├── db-postgres.js                   # PostgreSQL database layer (~580 lines)
├── server-postgres.js               # Express API server (~550 lines)
├── workflow-manager.js              # Workflow orchestration (~450 lines)
├── enrichment.js                    # Company enrichment (~590 lines)
├── setup-knowledge-base.js          # KB setup script (~130 lines)
│
├── db.js                            # SQLite database (legacy)
├── server.js                        # Old server (legacy)
│
├── .env                             # Environment variables (not in git)
├── .env.example                     # Environment template
├── .gitignore                       # Git ignore rules
├── package.json                     # Dependencies and scripts
├── package-lock.json                # Locked dependency versions
│
├── README.md                        # Main documentation
├── QUICKSTART.md                    # Quick setup guide
├── TESTING-CHECKLIST.md             # Testing procedures
├── IMPLEMENTATION-SUMMARY.md        # Technical details
├── WORKFLOW-DIAGRAM.md              # Visual workflow
├── API-DOCUMENTATION.md             # API reference
├── DEPLOYMENT.md                    # Deployment guide
├── CONTRIBUTING.md                  # Contribution guidelines
├── CHANGELOG.md                     # Version history
├── PROJECT-STRUCTURE.md             # This file
└── LICENSE                          # MIT License
```

---

## Core Components

### Backend

#### 1. Database Layer (`db-postgres.js`)

**Purpose:** PostgreSQL abstraction layer with all CRUD operations

**Key Classes:**
- `PostgresDatabase` - Main database interface

**Key Methods:**
```javascript
// Folders
createFolder(name, description)
getFolder(id)
getAllFolders()
deleteFolder(id)

// Jobs
addJobToFolder(folderId, jobData)
getJobsByFolder(folderId)

// Companies
createCompany(domain, name, data)
getCompany(domain)
saveEnrichedData(domain, data)

// Prospects
createProspect(prospectData)
getProspectsByFolder(folderId)
updateProspectSelection(id, selected)

// Background Tasks
createTask(type, folderId)
updateTaskStatus(id, status, progress)

// Notifications
createNotification(type, title, message)
getUnreadNotifications()

// Knowledge Base
addKnowledge(type, title, content)
getAllKnowledge()
```

**Database Tables:**
- `folders` - Campaign folders
- `jobs` - Job postings
- `companies` - Enriched company data
- `prospects` - Contact prospects
- `background_tasks` - Async task tracking
- `knowledge_base` - Profile storage
- `notifications` - User notifications
- `email_collection_log` - Daily limits

#### 2. API Server (`server-postgres.js`)

**Purpose:** Express.js REST API server

**Endpoints:**
- `/api/folders/*` - Folder management
- `/api/prospects/*` - Prospect operations
- `/api/notifications/*` - Notification system
- `/api/knowledge/*` - Knowledge base
- `/api/tasks/*` - Background tasks
- `/api/companies/*` - Company data (legacy)
- `/api/jobs/search` - Job search proxy

**Middleware:**
- Express JSON parser
- Static file serving
- Error handling

**Configuration:**
- Port: 3000 (default)
- Cache TTL: 4 hours
- Database: PostgreSQL

#### 3. Workflow Manager (`workflow-manager.js`)

**Purpose:** Orchestrates the complete outreach workflow

**Key Methods:**
```javascript
// Stage 1: Add job and trigger enrichment
addJobToFolder(folderId, jobData)

// Stage 2: Enrich company
enrichCompany(folderId, domain, name)
checkFolderEnrichmentStatus(folderId)

// Stage 3: Collect prospects
collectProspectsForFolder(folderId)
collectProspectsForCompany(folderId, company, job)
searchSignalHireProspects(domain, name, jobTitle, country, size)
filterAndRankProspects(candidates, job, company, size)
scoreProspectsWithAI(prospects, job, company, size)

// Stage 4: Auto-select
autoSelectProspects(folderId)

// Stage 5: Enrich contacts
enrichSelectedProspects(folderId)
```

**Rules Implemented:**
- Company size rules (founders vs VPs)
- Location filtering (same country)
- Prospect limits (20 per company)
- Daily email limits (150/day)
- Rate limiting (200ms delay)

#### 4. Company Enricher (`enrichment.js`)

**Purpose:** Scrapes and enriches company data with AI

**Key Methods:**
```javascript
// Main enrichment
enrich(domain, companyName)
enrichWithRetry(domain, companyName)

// Website scraping
fetchWebsiteContent(domain)
extractTextFromHtml(html)

// AI extraction
extractWithAI(domain, name, content)
extractWithGemini(domain, name, content)
extractWithClaude(domain, name, content)

// SignalHire integration
enrichContactsWithSignalHire(contacts, domain)
lookupContactSignalHire(contact, domain)
signalHirePersonLookup(params)
signalHireSearch(params)
```

**Pages Scraped:**
- Homepage
- /about, /about-us
- /company
- /team
- /careers, /jobs

**Data Extracted:**
- Company profile
- Leadership team
- Founders
- Target contacts
- Tech stack
- Culture/values

### Frontend

#### 1. Job Search (`app.js`)

**Purpose:** Main job search interface

**Key Functions:**
```javascript
// Search
handleSearch()
displayResults(jobs)
createJobCard(job)

// Folders (integration)
getJobFolders(job)
showFolderPicker(index)
addJobToFolder(index, folderId)

// AI features
analyzeJob(index)
generateCoverLetter(index)
```

**Features:**
- Advanced filtering
- Result caching
- Folder integration
- AI analysis
- Search history

#### 2. Folder Management (`folders.js`)

**Purpose:** Manage folders, prospects, and outreach

**Key Functions:**
```javascript
// Folders
loadFolders()
createFolder()
openFolder(id)
deleteFolder(id)

// Prospects
renderProspectsTable(prospects)
toggleProspect(id, selected)
autoSelectProspects(folderId)

// Workflow actions
collectProspects(folderId)
enrichContacts(folderId)
exportProspects(folderId)

// Notifications
loadNotifications()
updateNotificationBadge()
handleNotificationClick(id)
```

**Features:**
- Folder cards with status
- Grouped prospect table
- Real-time notifications
- Progress tracking
- CSV export

#### 3. Folder Integration (`app-folder-integration.js`)

**Purpose:** Connects job search to folders API

**Key Functions:**
```javascript
loadJobFolders()           // Load from API
createNewFolderAPI()       // Create via API
addJobToFolderAPI()        // Add job via API
extractCountry(location)   // Parse location
```

**Features:**
- API integration
- Fallback to localStorage
- Success notifications
- Error handling

---

## Data Flow

### 1. Job Search Flow

```
User Input → Form Validation → Theirstack API → Cache → Results Display
                                     ↓
                              Job Cards Rendered
                                     ↓
                              "+ Folder" Button
```

### 2. Folder Creation Flow

```
User Input → Validate → POST /api/folders → Database → Folder Created
                                                ↓
                                         Folder Card Displayed
```

### 3. Add Job Flow

```
Click "+ Folder" → Select Folder → POST /api/folders/:id/jobs → Database
                                                ↓
                                         Create Company Record
                                                ↓
                                         🚀 Trigger Enrichment
```

### 4. Enrichment Flow

```
Background Task Created → Scrape Website → AI Extraction → Save to DB
                                                ↓
                                         Create Notification
                                                ↓
                                         Update Folder Status
```

### 5. Prospect Collection Flow

```
User Clicks "Collect" → POST /api/folders/:id/collect-prospects
                                                ↓
                                    For Each Company:
                                    - Search SignalHire
                                    - Filter by location
                                    - Apply size rules
                                    - AI scoring
                                    - Limit to 20
                                                ↓
                                         Save to Database
                                                ↓
                                         Create Notification
```

### 6. Selection Flow

```
Manual: Check/Uncheck → PATCH /api/prospects/:id/select
Auto: Click Button → POST /api/folders/:id/auto-select
                                                ↓
                                    Update Database
                                                ↓
                                    Update Folder Status
```

### 7. Contact Enrichment Flow

```
User Clicks "Get Emails" → Check Daily Limit → POST /api/folders/:id/enrich-contacts
                                                ↓
                                    For Each Selected Prospect:
                                    - SignalHire lookup
                                    - Save email/phone
                                    - Increment counter
                                    - 200ms delay
                                                ↓
                                         Create Notification
                                                ↓
                                         Folder Ready for Export
```

---

## State Management

### Frontend State

**Job Search:**
- `jobsCache` - Current search results
- `currentPage` - Pagination state
- `searchHistory` - Recent searches
- `jobFolders` - Loaded folders

**Folders Page:**
- `folders` - All folders
- `currentFolder` - Open folder details
- `notifications` - Unread notifications

### Backend State

**In-Memory:**
- `searchCache` - Job search cache (4 hours)
- `processingQueue` - Active enrichments

**Database (Persistent):**
- All folders, jobs, companies, prospects
- Background tasks
- Notifications
- Knowledge base

---

## Configuration Files

### Environment Variables (`.env`)

```env
# Required
DATABASE_URL=postgresql://...
THEIRSTACK_API_KEY=...
GEMINI_API_KEY=...
SIGNALHIRE_API_KEY=...

# Optional
ANTHROPIC_API_KEY=...
PORT=3000
NODE_ENV=development
```

### Package Configuration (`package.json`)

**Scripts:**
- `start` - Production server
- `dev` - Development with auto-reload
- `setup-kb` - Initialize knowledge base

**Dependencies:**
- `express` - Web server
- `pg` - PostgreSQL client
- `@anthropic-ai/sdk` - Claude AI
- `@google/generative-ai` - Gemini AI
- `dotenv` - Environment variables

---

## API Architecture

### RESTful Endpoints

**Resource-based:**
- `/api/folders` - Folder CRUD
- `/api/prospects` - Prospect operations
- `/api/notifications` - Notification system

**Action-based:**
- `/api/folders/:id/collect-prospects`
- `/api/folders/:id/auto-select`
- `/api/folders/:id/enrich-contacts`

**Response Format:**
```json
{
  "status": "success|error",
  "message": "Human-readable message",
  "data": { /* response data */ }
}
```

---

## Database Schema

### Relationships

```
folders (1) ←→ (N) jobs
folders (1) ←→ (N) prospects
companies (1) ←→ (N) jobs
companies (1) ←→ (N) prospects
folders (1) ←→ (N) background_tasks
```

### Indexes

All foreign keys indexed:
- `idx_jobs_folder`
- `idx_jobs_domain`
- `idx_prospects_folder`
- `idx_prospects_company`
- `idx_tasks_folder`

Status fields indexed:
- `idx_folders_status`
- `idx_companies_status`
- `idx_tasks_status`

---

## Testing Structure

### Manual Testing
- `TESTING-CHECKLIST.md` - Step-by-step guide
- Covers all features and edge cases

### Automated Testing (Future)
```
tests/
├── unit/
│   ├── db-postgres.test.js
│   ├── workflow-manager.test.js
│   └── enrichment.test.js
├── integration/
│   ├── api.test.js
│   └── workflow.test.js
└── e2e/
    └── complete-flow.test.js
```

---

## Documentation Structure

### User Documentation
- `README.md` - Overview and features
- `QUICKSTART.md` - 5-minute setup
- `WORKFLOW-DIAGRAM.md` - Visual guide

### Technical Documentation
- `API-DOCUMENTATION.md` - API reference
- `IMPLEMENTATION-SUMMARY.md` - Technical details
- `PROJECT-STRUCTURE.md` - This file

### Operations Documentation
- `DEPLOYMENT.md` - Deployment guide
- `TESTING-CHECKLIST.md` - Testing procedures
- `CHANGELOG.md` - Version history

### Development Documentation
- `CONTRIBUTING.md` - Contribution guide
- Inline code comments
- JSDoc annotations (where applicable)

---

## Code Organization Principles

### Backend
- **Separation of concerns** - DB, API, logic separate
- **Single responsibility** - Each file has one purpose
- **Dependency injection** - Pass dependencies explicitly
- **Error handling** - Try-catch on all async operations

### Frontend
- **Progressive enhancement** - Works without JS
- **Event delegation** - Efficient event handling
- **Modular functions** - Small, focused functions
- **Clear naming** - Self-documenting code

### Database
- **Normalized schema** - Minimize redundancy
- **Proper indexes** - Fast queries
- **Foreign keys** - Data integrity
- **Audit columns** - created_at, updated_at

---

## Extension Points

### Adding New Features

**New API Endpoint:**
1. Add route in `server-postgres.js`
2. Add method in `db-postgres.js`
3. Update API documentation
4. Add frontend integration

**New Workflow Stage:**
1. Add method in `workflow-manager.js`
2. Update folder status enum
3. Add UI button in `folders.js`
4. Update documentation

**New AI Integration:**
1. Add provider in `enrichment.js`
2. Update environment variables
3. Add fallback logic
4. Test thoroughly

---

## Performance Considerations

### Database
- Connection pooling (pg.Pool)
- Proper indexing
- Parameterized queries
- Batch operations

### API
- Result caching (4 hours)
- Async processing
- Rate limiting
- Error recovery

### Frontend
- Minimal DOM manipulation
- Event delegation
- Lazy loading (future)
- Optimized CSS

---

## Security Measures

### Backend
- SQL injection prevention (parameterized queries)
- Environment variable secrets
- SSL database connections
- Input validation

### Frontend
- XSS prevention (HTML escaping)
- CSRF protection (future)
- Secure communication (HTTPS)
- No sensitive data in client

---

## Maintenance Tasks

### Regular
- Review failed tasks weekly
- Clear old notifications monthly
- Check API usage weekly
- Update dependencies quarterly

### As Needed
- Database backups
- Log rotation
- Cache clearing
- Performance monitoring

---

## Future Improvements

### Architecture
- [ ] Separate worker process for background tasks
- [ ] Redis queue for task management
- [ ] Microservices for scaling
- [ ] GraphQL API alternative

### Testing
- [ ] Unit test coverage
- [ ] Integration tests
- [ ] E2E tests
- [ ] Performance tests

### Features
- [ ] User authentication
- [ ] Multi-tenancy
- [ ] Real-time updates (WebSocket)
- [ ] Advanced analytics

---

**Questions about the structure?**

Check the relevant documentation files or email: support@insightstap.com
