# Getting Started with JobFeeder

Complete beginner's guide to using JobFeeder for GTM outreach automation.

## What is JobFeeder?

JobFeeder is an automated system that helps you find prospects for your GTM engineering services by:
1. Finding relevant job postings
2. Enriching company data automatically
3. Discovering decision-makers at those companies
4. Getting their contact information
5. Preparing everything for outreach

**Time Saved:** What used to take days now takes hours, mostly running in the background.

---

## Prerequisites

Before you start:
- [ ] Computer with Node.js 18+ installed
- [ ] Internet connection
- [ ] API keys from:
  - Theirstack (for job search)
  - Gemini or Claude (for AI)
  - SignalHire (for contacts)

**Don't have API keys?** See [Getting API Keys](#getting-api-keys) below.

---

## Installation (5 Minutes)

### Step 1: Install Node.js

**Check if you have Node.js:**
```bash
node --version
```

If you see `v18.0.0` or higher, you're good! Otherwise:

**Download Node.js:**
- Go to https://nodejs.org
- Download LTS version (recommended)
- Install it
- Restart your terminal

### Step 2: Download JobFeeder

**Option A: Clone with Git**
```bash
git clone https://github.com/yourusername/jobfeeder.git
cd jobfeeder
```

**Option B: Download ZIP**
- Download from GitHub
- Extract to a folder
- Open terminal in that folder

### Step 3: Install Dependencies

```bash
npm install
```

This will install all required packages. Takes 1-2 minutes.

### Step 4: Configure API Keys

**Edit the `.env` file:**
```bash
# On Windows
notepad .env

# On Mac/Linux
nano .env
```

**Add your API keys:**
```env
THEIRSTACK_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
SIGNALHIRE_API_KEY=your_key_here
```

The database URL is already configured for you!

### Step 5: Start the Server

```bash
npm start
```

You should see:
```
PostgreSQL database connected successfully
PostgreSQL tables created successfully
JobFeeder server running on port 3000
```

### Step 6: Open the App

**In your browser, go to:**
```
http://localhost:3000
```

You should see the JobFeeder interface!

---

## Your First Campaign (15 Minutes)

Let's create your first outreach campaign step by step.

### Step 1: Search for Jobs

1. **Open JobFeeder** at http://localhost:3000
2. **Enter job search criteria:**
   - Job Title: "GTM Engineer"
   - Location: "United Kingdom" (or "United States")
   - Click "Search Jobs"

3. **Browse results:**
   - You'll see job listings with company info
   - Each job shows company size, location, salary

**Tip:** Start with 5-10 jobs for your first campaign.

### Step 2: Create a Folder

1. **Go to Folders page:**
   - Click "Folders" in the top navigation

2. **Create a new folder:**
   - Enter name: "GTM Engineer - UK"
   - Description: "First campaign targeting UK GTM roles"
   - Click "Create Folder"

3. **Folder appears:**
   - You'll see a folder card
   - Status shows "Jobs Added"
   - Job count is 0

### Step 3: Add Jobs to Folder

1. **Go back to job search**
   - Click "Jobs" in navigation

2. **Add jobs one by one:**
   - Click the "+ folder icon" on any job you like
   - Select "GTM Engineer - UK" folder
   - Success message appears
   - Folder icon changes (shows it's added)

3. **Add 5-10 jobs:**
   - Pick companies that seem like good fits
   - Consider company size (50-500 is ideal)
   - Look for tech companies or SaaS

**What's happening in the background:**
- System is automatically scraping company websites
- AI is extracting company profiles
- This takes 5-10 minutes for 5-10 companies

### Step 4: Wait for Enrichment

1. **Go back to Folders page**

2. **Check notifications:**
   - Bell icon in top right
   - Badge shows unread count
   - Wait 5-10 minutes

3. **When enrichment completes:**
   - Notification: "Company Enrichment Complete"
   - Folder status changes to "Company Enriched"
   - Badge updates

**During this time:**
- You can browse other jobs
- Add more jobs to other folders
- Take a coffee break ☕

### Step 5: Collect Prospects

1. **Open your folder:**
   - Click on the "GTM Engineer - UK" folder card
   - See all jobs listed
   - Check background tasks (all completed)

2. **Start prospect collection:**
   - Click "Collect Prospects" button
   - Confirm the action
   - Folder closes

3. **Wait for collection:**
   - Takes 10-20 minutes for 5-10 companies
   - Check notifications periodically
   - Bell badge will update

4. **When collection completes:**
   - Notification: "Prospect Collection Complete"
   - Shows count (e.g., "250 prospects collected")
   - Folder status: "Prospects Collected"

**What's happening:**
- System searches SignalHire for decision-makers
- Finds VPs, Heads, Directors at each company
- Filters by job location
- Ranks with AI scoring
- Limits to 20 per company

### Step 6: Review and Select Prospects

1. **Open folder again:**
   - See "Prospects" section
   - Table shows prospects grouped by company
   - Each has name, title, priority, AI score

2. **Review the prospects:**
   - Look at titles (VP Sales, Head of Marketing)
   - Check AI scores (higher is better)
   - See priority (high/medium/low)

3. **Select prospects:**

   **Option A - Auto-select (recommended for first time):**
   - Click "Auto-Select Top 2-3 per Company"
   - Confirm
   - Top prospects automatically checked
   - Folder status: "Prospects Selected"

   **Option B - Manual:**
   - Check boxes for prospects you want
   - Select 2-3 per company
   - Focus on high priority/high score

**Result:** You should have 15-30 prospects selected (2-3 per company).

### Step 7: Get Email Addresses

1. **Click "Get Email Addresses" button**
   - Shows count of selected prospects
   - Warns about daily limit (150/day)
   - Confirm to proceed

2. **Wait for enrichment:**
   - Takes 5-10 minutes
   - System looks up each prospect
   - Finds email addresses and phone numbers

3. **When complete:**
   - Notification: "Contact Enrichment Complete"
   - Shows count (e.g., "22/30 emails found")
   - Folder status: "Ready for Outreach"

**Expected success rate:** 70-80% of prospects will have emails.

### Step 8: Export and Start Outreach

1. **Open folder one last time**

2. **Click "Export Prospects" button**
   - CSV file downloads
   - Opens in Excel/Sheets

3. **Review the export:**
   - All selected prospects
   - Name, title, company
   - Email, phone, LinkedIn
   - Priority and AI score

4. **Import to your CRM:**
   - Upload to HubSpot/Salesforce
   - Or use for manual outreach
   - Start your campaign!

**Congratulations! 🎉** You've completed your first campaign.

---

## Understanding the Results

### What You Get

**For 10 jobs added:**
- ~8 companies enriched (80% success)
- ~150 prospects collected
- ~25 prospects selected (top 2-3 each)
- ~20 email addresses found (80%)

### What the Data Includes

**Company Data:**
- Company profile and mission
- Leadership team names
- Founders (if applicable)
- Tech stack used
- Company culture
- Growth signals

**Prospect Data:**
- Full name
- Job title
- Department
- LinkedIn profile
- Email address
- Phone number
- Priority level (high/medium/low)
- AI score (0-100%)

### How to Use It

**Email Outreach:**
- Use prospects with high AI scores
- Personalize based on company data
- Reference their tech stack or growth

**LinkedIn Outreach:**
- Connect request with note
- Reference their company's mission
- Mention relevant experience

**Multi-channel:**
- Email + LinkedIn + Phone
- Follow up consistently
- Track responses

---

## Tips for Success

### Job Selection
✅ **Do:**
- Choose companies 50-500 employees
- Look for tech/SaaS companies
- Check if they're hiring (good signal)
- Pick companies you'd actually want to work with

❌ **Don't:**
- Add too many small companies (<20 employees)
- Add huge enterprises (unless specific)
- Ignore company stage/funding
- Forget about geographic relevance

### Prospect Selection
✅ **Do:**
- Trust the AI auto-selection (it works)
- Focus on high priority prospects
- Select 2-3 per company maximum
- Look for VP/Head level titles

❌ **Don't:**
- Select everyone (quality > quantity)
- Ignore AI scores
- Pick only junior roles
- Exceed daily email limits

### Campaign Management
✅ **Do:**
- Create focused folders (one role type)
- Add 20-50 jobs per campaign
- Let background tasks complete
- Check notifications regularly

❌ **Don't:**
- Mix different roles in one folder
- Add hundreds of jobs at once
- Restart tasks that are running
- Ignore failed enrichments

---

## Common Questions

### How long does everything take?

**Active time:** ~20 minutes
- Job search: 5 minutes
- Creating folder: 1 minute
- Adding jobs: 5 minutes
- Reviewing prospects: 5 minutes
- Exporting: 1 minute

**Wait time:** ~1-2 hours
- Company enrichment: 30-60 minutes
- Prospect collection: 20-40 minutes
- Contact enrichment: 10-20 minutes

**Total:** ~1.5-2 hours for a campaign

### How many prospects should I expect?

- **Jobs added:** 50
- **Companies enriched:** ~40 (80%)
- **Prospects collected:** ~600-800
- **Auto-selected:** ~100-120 (2-3 per company)
- **With emails:** ~80-100 (70-80% coverage)

### What's the daily limit?

**Email collection:** 150 per day
- Resets at midnight UTC
- Protects SignalHire credits
- Plan your prospect selection accordingly

### What if enrichment fails?

**Company enrichment:**
- System retries automatically (3 times)
- Some websites block scrapers (normal)
- 80% success rate is typical
- Failed companies can be retried manually

**Contact enrichment:**
- Not all prospects have emails (normal)
- 70-80% success rate is typical
- LinkedIn URLs still available
- Can supplement with manual research

### Can I run multiple campaigns?

**Yes!** You can:
- Create multiple folders
- Run them simultaneously
- Each has independent workflow
- Notifications track all of them

**Best practice:**
- Focus on one at a time
- Complete before starting next
- Respect daily email limits
- Keep folders organized

---

## Getting API Keys

### Theirstack (Job Search)

1. Go to https://theirstack.com
2. Sign up for account
3. Go to API section
4. Generate API key
5. Copy to `.env` file

**Pricing:** Varies by plan, check their website

### Google Gemini (AI Processing)

1. Go to https://makersuite.google.com/app/apikey
2. Sign in with Google
3. Click "Create API Key"
4. Copy to `.env` file

**Pricing:** Free tier available, ~$0.02 per 1000 requests

### SignalHire (Contact Data)

1. Go to https://www.signalhire.com
2. Sign up for account
3. Go to Settings → API
4. Copy API key
5. Add to `.env` file

**Pricing:** Starts at ~$99/month for 500 emails

---

## Troubleshooting

### Server won't start

**Check:**
```bash
# Is Node.js installed?
node --version

# Is port 3000 available?
# Try different port in .env:
PORT=3001
```

### Database connection error

**Check:**
- Is DATABASE_URL correct in `.env`?
- Is your internet connected?
- Can you access Render.com?

### No jobs found

**Check:**
- Is THEIRSTACK_API_KEY correct?
- Try broader search terms
- Check if API has credits
- Try different location

### Company enrichment stuck

**Check:**
- Open folder and check background tasks
- Look for error messages
- Some companies fail (normal)
- Wait 10-15 minutes before worrying

### Prospect collection returns empty

**Check:**
- Is SIGNALHIRE_API_KEY correct?
- Are companies enriched first?
- Try different companies
- Some companies have limited data

### Daily limit reached

**Solution:**
- Wait until next day (midnight UTC)
- Continue without enriching more
- Export what you have
- Plan better next time

---

## Next Steps

### After Your First Campaign

1. **Analyze Results:**
   - Which companies responded?
   - Which titles are most relevant?
   - What messaging worked?

2. **Refine Approach:**
   - Adjust job search criteria
   - Focus on successful company types
   - Improve prospect selection

3. **Scale Up:**
   - Create more folders
   - Run multiple campaigns
   - Track performance

4. **Integrate:**
   - Import to CRM
   - Set up email sequences
   - Track conversions

### Advanced Features

- **Knowledge Base:** Add your pitch decks and case studies
- **Custom Guidelines:** Tailor prospect selection
- **Batch Processing:** Run multiple campaigns
- **Export Variations:** Different formats for different uses

### Get Help

- Read [README.md](README.md) for complete docs
- Check [TROUBLESHOOTING section](#troubleshooting)
- Review [API-DOCUMENTATION.md](API-DOCUMENTATION.md)
- Email: support@insightstap.com

---

## Success Checklist

After following this guide, you should have:
- [ ] JobFeeder installed and running
- [ ] API keys configured
- [ ] First folder created
- [ ] 5-10 jobs added
- [ ] Companies enriched
- [ ] Prospects collected
- [ ] Top prospects selected
- [ ] Contact info enriched
- [ ] CSV exported
- [ ] Ready for outreach

**If you checked all boxes: You're ready to scale! 🚀**

---

## Resources

- **Documentation:** [README.md](README.md)
- **Quick Setup:** [QUICKSTART.md](QUICKSTART.md)
- **API Reference:** [API-DOCUMENTATION.md](API-DOCUMENTATION.md)
- **Testing Guide:** [TESTING-CHECKLIST.md](TESTING-CHECKLIST.md)
- **Workflow Diagram:** [WORKFLOW-DIAGRAM.md](WORKFLOW-DIAGRAM.md)

---

**Welcome to JobFeeder! Happy Prospecting! 🎯**
