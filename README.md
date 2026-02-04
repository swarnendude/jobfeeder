# JobFeeder - GTM Outreach Automation

A comprehensive system for finding jobs, enriching company data, collecting prospects, and managing outreach campaigns for GTM engineering services.

## Features

### 🔍 Job Search
- Search for jobs using Theirstack API with advanced filters
- Filter by title, location, company size, industry, tech stack, etc.
- Cache results for 4 hours to save API calls

### 📁 Folder Management
- Organize jobs into folders (e.g., "GTM Engineer - UK/US")
- Multiple jobs per folder for campaign-based organization
- Track folder status through workflow stages
- **Cloud Storage:** Folders stored in PostgreSQL database
- **Auto-Migration:** Existing localStorage folders automatically migrated on first load

### 🏢 Automatic Company Enrichment
- Automatically enriches company data when job is added to folder
- Scrapes company website for profile information
- Uses AI (Gemini or Claude) to extract structured data
- Background processing with retry logic

### 👥 Prospect Collection
- Searches for decision-makers using SignalHire API
- Smart role matching based on job type and company size
- Location filtering (same country as job)
- Limits to max 20 prospects per company
- AI scoring and ranking of prospects

### ✨ AI Auto-Selection
- Automatically selects top 2-3 prospects per company
- Based on job relevance and seniority matching
- Considers company size for founder inclusion rules:
  - <50 employees: Include founders
  - 50-500: Founders + relevant VPs
  - 500+: Only relevant VPs

### 📧 Contact Enrichment
- Enriches selected prospects with email addresses using SignalHire
- Daily limit tracking (150 emails/day)
- Background processing with progress tracking
- Batch processing with rate limiting

### 🔔 Notification System
- Real-time notifications for task completion
- Notification history and status tracking
- Email notification support (optional)

### 📊 Export & Analytics
- Export selected prospects to CSV
- Include email, phone, LinkedIn, priority, AI score
- Ready for CRM import or email automation

## Workflow Stages

1. **Jobs Added** - Jobs have been added to the folder
2. **Company Enriched** - All companies have been enriched with profile data
3. **Prospects Collected** - Prospects have been found and ranked
4. **Prospects Selected** - Top prospects have been selected
5. **Ready for Outreach** - Contact information has been enriched

## Installation

### Prerequisites
- Node.js 18+
- PostgreSQL database (Render.com or any provider)
- API Keys:
  - Theirstack API
  - Gemini API or Anthropic API
  - SignalHire API

### Setup Steps

1. **Clone and Install**
   ```bash
   npm install
   ```

2. **Configure Environment**
   Create a `.env` file (see `.env.example`):
   ```env
   THEIRSTACK_API_KEY=your_key_here
   GEMINI_API_KEY=your_key_here
   SIGNALHIRE_API_KEY=your_key_here
   DATABASE_URL=postgresql://user:pass@host:port/database
   ```

3. **Initialize Database**
   The database schema will be created automatically on first run.

4. **Setup Knowledge Base**
   ```bash
   npm run setup-kb
   ```
   This will scrape and store:
   - InsightsTap company profile (insightstap.com)
   - Swarnendu De profile (swarnendu.de)
   - Ritesh Osta profile (riteshosta.com)
   - GTM services guidelines

5. **Start the Server**
   ```bash
   npm start
   ```
   Development mode (with auto-reload):
   ```bash
   npm run dev
   ```

6. **Access the Application**
   - Open http://localhost:3000
   - Job Search: http://localhost:3000/
   - Folders & Prospects: http://localhost:3000/folders.html
   - Companies: http://localhost:3000/companies.html

## Usage Guide

### Step 1: Search for Jobs
1. Go to the home page
2. Enter job title (e.g., "GTM Engineer")
3. Add filters (location, company size, etc.)
4. Click "Search Jobs"

### Step 2: Create a Folder
1. Click "Folders" in the navigation
2. Enter a folder name (e.g., "GTM Engineer - UK/US")
3. Click "Create Folder"

### Step 3: Add Jobs to Folder
1. From search results, click the "+ folder icon" on any job
2. Select your folder
3. Job will be added and company enrichment will start automatically

*Repeat for multiple jobs in the same campaign*

### Step 4: Wait for Company Enrichment
- Check the folder card status
- Background tasks will scrape company websites
- AI will extract structured data
- Notification will appear when complete
- Folder status changes to "Company Enriched"

### Step 5: Collect Prospects
1. Click "Collect Prospects" button on folder
2. System will:
   - Search SignalHire for relevant roles
   - Match prospects to job requirements
   - Filter by location and seniority
   - Rank prospects with AI scoring
   - Limit to 20 per company
3. Check notifications for completion

### Step 6: Review and Select Prospects
1. Open the folder
2. View prospects grouped by company
3. Manual selection:
   - Check/uncheck individual prospects
4. Or use "Auto-Select" for top 2-3 per company

### Step 7: Enrich Contact Information
1. Click "Get Email Addresses"
2. System will use SignalHire to find emails
3. Respects daily limit (150 emails/day)
4. Progress tracked in background tasks

### Step 8: Export for Outreach
1. Click "Export Prospects" button
2. Download CSV with all contact information
3. Import into your CRM or email tool
4. Start your outreach campaign!

## API Endpoints

### Folders
- `GET /api/folders` - List all folders
- `POST /api/folders` - Create new folder
- `GET /api/folders/:id` - Get folder details
- `DELETE /api/folders/:id` - Delete folder
- `POST /api/folders/:id/jobs` - Add job to folder
- `POST /api/folders/:id/collect-prospects` - Start prospect collection
- `POST /api/folders/:id/auto-select` - Auto-select top prospects
- `POST /api/folders/:id/enrich-contacts` - Enrich selected prospects

### Prospects
- `PATCH /api/prospects/:id/select` - Toggle prospect selection

### Notifications
- `GET /api/notifications` - Get recent notifications
- `GET /api/notifications/unread` - Get unread notifications
- `PATCH /api/notifications/:id/read` - Mark as read
- `POST /api/notifications/read-all` - Mark all as read

### Knowledge Base
- `GET /api/knowledge` - Get all knowledge entries
- `POST /api/knowledge` - Add knowledge entry
- `PATCH /api/knowledge/:id` - Update knowledge entry

### Tasks
- `GET /api/tasks` - Get recent tasks
- `GET /api/tasks/active` - Get active tasks

### Companies (Legacy)
- `GET /api/companies` - List all companies
- `GET /api/companies/:domain` - Get company details

## Database Schema

### Core Tables
- `folders` - Job folders and campaigns
- `jobs` - Job postings in folders
- `companies` - Enriched company profiles
- `prospects` - Contact prospects for outreach
- `background_tasks` - Async task tracking
- `knowledge_base` - Profile and guideline storage
- `notifications` - User notifications
- `email_collection_log` - Daily email limit tracking

## Configuration

### Company Size Rules
- Small (<50): Include founders
- Medium (50-500): Founders + VPs
- Large (500+): VPs only, skip founders

### Prospect Limits
- Max 20 prospects per company
- AI selects top 2-3 for auto-selection
- Location filter: Same country as job

### API Limits
- SignalHire: 600 requests/minute (200ms delay between calls)
- Email collection: 150/day maximum
- Job search cache: 4 hours TTL

## Troubleshooting

### Database Connection Failed
- Verify DATABASE_URL is correct
- Check PostgreSQL is running
- Ensure SSL is enabled for cloud databases

### Company Enrichment Stuck
- Check GEMINI_API_KEY or ANTHROPIC_API_KEY is set
- Verify company domain is valid
- Check background_tasks table for errors

### Prospect Collection Returns Empty
- Verify SIGNALHIRE_API_KEY is set
- Check company names are correct
- Ensure location matching is working

### Daily Email Limit Reached
- Wait until next day (resets at midnight UTC)
- Check `email_collection_log` table
- Consider upgrading SignalHire plan

### Notifications Not Appearing
- Check browser console for errors
- Verify /api/notifications/unread returns data
- Clear browser cache

## Development

### Run with Auto-Reload
```bash
npm run dev
```

### Database Migrations
Schema is auto-created on startup. For manual updates:
```javascript
// In db-postgres.js, modify createTables() function
```

### Adding New Workflow Steps
1. Update `workflow-manager.js` with new methods
2. Add API endpoints in `server-postgres.js`
3. Update frontend in `folders.js`
4. Add new status to folder status enum

## Production Deployment

### Render.com
1. Create PostgreSQL database
2. Create Web Service
3. Connect to Git repository
4. Set environment variables
5. Deploy

### Environment Variables for Production
```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://...
THEIRSTACK_API_KEY=...
GEMINI_API_KEY=...
SIGNALHIRE_API_KEY=...
```

## Architecture

### Backend
- **server-postgres.js**: Express server with PostgreSQL
- **db-postgres.js**: Database layer (PostgreSQL)
- **enrichment.js**: Company enrichment with web scraping
- **workflow-manager.js**: Orchestrates the complete flow

### Frontend
- **app.js**: Job search interface
- **folders.js**: Folder and prospect management
- **app-folder-integration.js**: Connects search to folders API

### Background Processing
- Tasks run asynchronously
- Progress tracked in database
- Notifications sent on completion
- Retry logic for failures

## License

MIT

## Support

For issues or questions:
- GitHub Issues: [Create an issue]
- Email: support@insightstap.com

---

**Built with ❤️ by InsightsTap**
