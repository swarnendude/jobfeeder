# Changelog

All notable changes to JobFeeder will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- User authentication and authorization
- Email notification implementation (SMTP)
- CRM integrations (HubSpot, Salesforce)
- Unit and integration tests
- Advanced prospect filtering
- Analytics dashboard
- Email sequence automation
- Mobile app

---

## [1.0.0] - 2024-02-04

### Added - Initial Release

#### Core Features
- **Complete PostgreSQL Backend**
  - 9-table database schema
  - 20+ RESTful API endpoints
  - Background task processing system
  - Workflow orchestration manager
  - Notification system
  - Knowledge base storage

- **Job Search & Management**
  - Integration with Theirstack API
  - Advanced job filtering
  - 4-hour result caching
  - Folder-based organization
  - Multiple jobs per folder support

- **Company Enrichment**
  - Automatic enrichment when job added
  - Website scraping (8 common URLs)
  - AI-powered data extraction (Gemini/Claude)
  - Structured data extraction:
    - Company profile and tagline
    - Leadership team and founders
    - Target contacts for outreach
    - Tech stack and culture
    - GTM opportunity assessment
  - Retry logic with exponential backoff
  - Error tracking and reporting

- **Prospect Collection**
  - SignalHire API integration
  - Smart role-based searching
  - Company size rules:
    - <50 employees: Include founders
    - 50-500: Founders + VPs
    - 500+: VPs only
  - Location filtering (same country as job)
  - AI scoring and ranking
  - 20 prospects per company limit

- **Prospect Selection**
  - Manual selection via checkboxes
  - AI auto-selection (top 2-3 per company)
  - Based on job relevance and seniority
  - Grouped display by company
  - Priority indicators (high/medium/low)
  - AI score display (0-100%)

- **Contact Enrichment**
  - Email address lookup via SignalHire
  - Phone number collection
  - Daily limit enforcement (150 emails/day)
  - Rate limiting (600 requests/min)
  - Batch processing with progress tracking

- **Frontend Interface**
  - Modern, responsive design
  - Job search with filters
  - Folder management page
  - Real-time notifications with badge
  - Background task progress tracking
  - CSV export functionality
  - Grouped prospect table view

- **Notification System**
  - Real-time task completion alerts
  - Unread badge count
  - Click-through navigation
  - Notification history
  - Mark as read functionality

- **Knowledge Base**
  - Company profile storage
  - User profile storage
  - Guideline storage
  - Setup script for scraping profiles:
    - InsightsTap company profile
    - Swarnendu De personal profile
    - Ritesh Osta personal profile
    - GTM services guidelines

- **Documentation**
  - Comprehensive README
  - Quick start guide
  - Testing checklist
  - Implementation summary
  - Workflow diagram
  - API documentation
  - Deployment guide
  - Contributing guidelines

#### Technical Implementation

**Backend:**
- Node.js 18+ with Express.js
- PostgreSQL database with connection pooling
- Background task queue system
- Retry logic for failed operations
- Error handling and logging
- Rate limiting for external APIs

**Frontend:**
- Vanilla JavaScript (no framework)
- Modern async/await patterns
- Event-driven architecture
- Real-time UI updates
- CSV export generation

**Database:**
- 9 core tables with proper relationships
- Comprehensive indexes for performance
- Foreign key constraints
- Check constraints for data integrity
- Automatic timestamp tracking

**APIs Integrated:**
- Theirstack (job search)
- Google Gemini (AI processing)
- Anthropic Claude (alternative AI)
- SignalHire (prospect & contact data)

**Security:**
- SQL injection prevention (parameterized queries)
- XSS prevention (HTML escaping)
- Environment variable configuration
- SSL database connections
- Secure API key management

**Performance:**
- Database connection pooling
- Query result caching (4 hours)
- Indexed database queries
- Async/background processing
- Rate limiting compliance

#### Workflow Stages

1. **Jobs Added**
   - User creates folder
   - User adds jobs from search
   - Automatic enrichment triggered

2. **Company Enriched**
   - Background scraping complete
   - AI extraction finished
   - All companies processed

3. **Prospects Collected**
   - SignalHire search complete
   - AI ranking finished
   - Up to 20 per company

4. **Prospects Selected**
   - Manual or auto selection
   - Top 2-3 per company chosen
   - Ready for enrichment

5. **Ready for Outreach**
   - Email addresses collected
   - Contact info complete
   - CSV export available

#### Configuration & Rules

**Company Size Rules:**
- Small (<50): Founders only
- Medium (50-500): Founders + VPs
- Large (500+): VPs only

**Prospect Limits:**
- Max 20 per company
- AI auto-selects 2-3
- Location-based filtering

**API Limits:**
- SignalHire: 600/min (200ms delay)
- Email collection: 150/day
- Job cache: 4 hours TTL

**Target Roles:**
- GTM/Sales: VP Sales, VP Marketing, CRO
- Engineering: CTO, VP Engineering
- Founders: For small/medium companies

### Changed
- Migrated from SQLite to PostgreSQL
- Updated server to use cloud database
- Enhanced folder system for campaigns
- Improved error messages

### Fixed
- Database connection handling
- Background task race conditions
- Notification timing issues
- Prospect de-duplication

---

## [0.1.0] - 2024-01-15

### Added
- Initial prototype
- Basic job search
- SQLite database
- Company scraping POC
- Simple UI

### Known Issues
- No user authentication
- Local database only
- Manual prospect collection
- No notifications
- Limited error handling

---

## Version History Summary

| Version | Date | Key Features |
|---------|------|--------------|
| 1.0.0 | 2024-02-04 | Full production release |
| 0.1.0 | 2024-01-15 | Initial prototype |

---

## Upgrade Guide

### From 0.1.0 to 1.0.0

**Breaking Changes:**
- Database changed from SQLite to PostgreSQL
- API endpoints restructured
- Folder system completely redesigned

**Migration Steps:**

1. **Setup PostgreSQL Database**
   ```bash
   # Get database URL from Render.com
   # Add to .env file
   ```

2. **Update Dependencies**
   ```bash
   npm install
   ```

3. **Migrate Data** (if needed)
   ```javascript
   // Export from SQLite
   // Import to PostgreSQL
   // Manual process for v0.1.0 → v1.0.0
   ```

4. **Update Environment Variables**
   ```env
   DATABASE_URL=postgresql://...
   ```

5. **Initialize New System**
   ```bash
   npm start
   npm run setup-kb
   ```

6. **Test All Features**
   - Follow TESTING-CHECKLIST.md

---

## Deprecations

### Removed in 1.0.0
- SQLite database support
- Local folder storage
- Synchronous enrichment
- Old API endpoints

---

## Contributors

### v1.0.0
- Initial development and documentation
- Database schema design
- Workflow implementation
- Frontend development
- Documentation

---

## Support

For issues or questions about specific versions:
- Check version-specific documentation
- Review migration guides
- Open GitHub issue with version tag
- Email: support@insightstap.com

---

## Links

- [GitHub Repository](https://github.com/insightstap/jobfeeder)
- [Documentation](https://github.com/insightstap/jobfeeder/blob/master/README.md)
- [Issue Tracker](https://github.com/insightstap/jobfeeder/issues)
- [Releases](https://github.com/insightstap/jobfeeder/releases)

---

**Legend:**
- `Added` - New features
- `Changed` - Changes to existing functionality
- `Deprecated` - Soon-to-be removed features
- `Removed` - Now removed features
- `Fixed` - Bug fixes
- `Security` - Vulnerability fixes
