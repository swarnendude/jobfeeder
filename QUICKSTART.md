# JobFeeder - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### 1. Install Dependencies
```bash
npm install
```

### 2. Add Your API Keys
Edit `.env` file and add your API keys:
```env
THEIRSTACK_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here  # or ANTHROPIC_API_KEY
SIGNALHIRE_API_KEY=your_key_here
```

### 3. Setup Knowledge Base (Optional but Recommended)
```bash
npm run setup-kb
```
This scrapes your company and personal profiles for AI context.

### 4. Start the Server
```bash
npm start
```

### 5. Open the App
- Go to http://localhost:3000
- Search for jobs
- Create a folder
- Add jobs to folder
- Watch the magic happen! ✨

## 📋 Complete Workflow Example

### Scenario: Finding GTM Engineer Prospects in UK/US

1. **Search for Jobs**
   - Go to http://localhost:3000
   - Job Title: "GTM Engineer"
   - Location: "UK" (or "US")
   - Click "Search Jobs"

2. **Create Campaign Folder**
   - Go to "Folders" tab
   - Create folder: "GTM Engineer - UK/US"

3. **Add Relevant Jobs**
   - Browse search results
   - Click "+  folder icon" on jobs you like
   - Select "GTM Engineer - UK/US" folder
   - Add 10-50 jobs over time

4. **Company Enrichment (Automatic)**
   - Happens in background when you add jobs
   - Check folder status: "Jobs Added" → "Company Enriched"
   - Takes ~5-10 minutes for 10 companies
   - Get notification when done

5. **Collect Prospects**
   - Open your folder
   - Click "Collect Prospects" button
   - System finds 10-20 prospects per company
   - AI ranks by relevance
   - Takes ~10-15 minutes
   - Get notification when done

6. **Select Top Prospects**
   - Option A: Manual - Review and check boxes
   - Option B: Auto - Click "Auto-Select Top 2-3 per Company"
   - Best: Use auto-select, then manually adjust

7. **Get Email Addresses**
   - Click "Get Email Addresses"
   - Uses SignalHire to find emails
   - Respects 150 emails/day limit
   - Takes ~5 minutes
   - Get notification when done

8. **Export & Start Outreach**
   - Click "Export Prospects"
   - Download CSV file
   - Import to your CRM (HubSpot, Salesforce, etc.)
   - Start your outreach campaign!

## ⚙️ Configuration Tips

### For Best Results

**Company Enrichment:**
- Prefer Gemini API (cheaper and faster than Claude)
- Runs automatically when you add jobs
- Retries failed enrichments automatically

**Prospect Collection:**
- SignalHire searches based on job type
- Automatically filters by job location
- Respects company size rules (founders vs VPs)
- Limits to 20 prospects max per company

**Email Collection:**
- 150 emails per day limit
- Resets at midnight UTC
- Plan your prospect selection accordingly
- Export can be done anytime, enrichment must finish first

### Folder Organization

**Recommended Approach:**
- One folder per role type and region
- Example: "GTM Engineer - UK/US"
- Example: "Head of Sales - EMEA"
- Add multiple jobs to same folder
- Makes prospect management easier

**Not Recommended:**
- One folder per job posting (too many folders)
- Mixing different roles in one folder (confusing)

## 🎯 Pro Tips

1. **Batch Processing**
   - Add 10-20 jobs to a folder over time
   - Let enrichment run in background
   - Collect prospects once for all companies
   - More efficient than one-by-one

2. **Quality over Quantity**
   - Don't add every job you find
   - Be selective about company fit
   - Consider if they need GTM services
   - Check company size and funding stage

3. **Monitor Background Tasks**
   - Check notifications bell (top right)
   - View folder status for progress
   - Open folder to see task details
   - Tasks can fail - check error messages

4. **Daily Email Limit Strategy**
   - Day 1: Collect prospects for 50 companies
   - Day 2: Auto-select top 100-150 prospects
   - Day 3: Enrich contacts (150 emails)
   - Day 4: Enrich remaining (if any)
   - Day 5: Export and start outreach

5. **Knowledge Base**
   - Add your pitch deck as document
   - Add case studies
   - Add buyer personas
   - AI uses this for better prospect filtering

## 🐛 Common Issues

**"Database not initialized"**
- Server is starting up, wait 10 seconds
- Check DATABASE_URL in .env
- Check PostgreSQL is accessible

**"Company enrichment failed"**
- Website might be blocking scrapers
- Try again, has auto-retry
- Some companies will fail, it's normal

**"Daily email limit reached"**
- Can still select prospects
- Can still export
- Wait until next day for enrichment
- Or use manual email lookup

**"No prospects found"**
- Company might not have target roles
- Try broader job title search
- Check SignalHire API key is valid
- Some companies have limited data

**Folder status stuck on "Jobs Added"**
- Enrichment might be processing
- Check notifications for failures
- Open folder, check background tasks
- Some enrichments take 10+ minutes

## 📊 Expected Results

**For 50 jobs in a folder:**
- Company enrichment: 30-60 minutes
- Prospect collection: 20-40 minutes
- Total prospects found: 500-1000
- AI auto-selected: 100-150
- With email addresses: 80-120 (depending on SignalHire coverage)

**Success Metrics:**
- ~70-80% companies successfully enriched
- ~60-70% prospects get email addresses
- ~2-3 high-quality prospects per company
- Ready for outreach in 1-2 hours total processing time

## 🎬 Next Steps

After setup:
1. Read the full [README.md](README.md) for details
2. Customize knowledge base with your materials
3. Set up email notifications (optional)
4. Integrate with your CRM
5. Start your first campaign!

## 💡 Need Help?

- Check [README.md](README.md) for full documentation
- Review API endpoint details
- Check database schema
- Contact: support@insightstap.com

---

**Happy Prospecting! 🎯**
