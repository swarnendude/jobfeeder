# Deployment Guide

Step-by-step guide to deploy JobFeeder to production.

## Deployment Options

### Option 1: Render.com (Recommended)
- PostgreSQL database already hosted there
- Free tier available
- Easy deployment from Git
- Auto-deploy on push

### Option 2: Heroku
- Similar to Render
- PostgreSQL add-on available
- Paid plans start at $7/month

### Option 3: DigitalOcean App Platform
- More control
- Starting at $5/month
- Includes database hosting

### Option 4: Self-Hosted (VPS)
- Most control
- Requires server management
- AWS, DigitalOcean, Linode, etc.

---

## Deployment to Render.com

### Prerequisites
- Render.com account
- GitHub/GitLab repository
- PostgreSQL database (already set up)

### Step 1: Prepare Repository

1. **Commit all changes:**
```bash
git add .
git commit -m "Ready for production deployment"
git push origin master
```

2. **Ensure .gitignore includes:**
```
node_modules/
.env
*.db
.DS_Store
```

### Step 2: Create Web Service on Render

1. Go to https://render.com/dashboard
2. Click "New +" → "Web Service"
3. Connect your GitHub/GitLab repository
4. Configure:

**Basic Settings:**
- Name: `jobfeeder`
- Region: `US East (Ohio)` (same as your database)
- Branch: `master`
- Root Directory: Leave empty
- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`

**Instance Type:**
- Free (for testing)
- Starter ($7/month for production)

### Step 3: Configure Environment Variables

Add these environment variables in Render dashboard:

```env
NODE_ENV=production
PORT=10000
DATABASE_URL=postgresql://jobfeeder_user:v3r2XEPHZzpdPFao8d79Nb3wz0mUgUYq@dpg-d61gn4soud1c73aa22fg-a.virginia-postgres.render.com/jobfeeder

# API Keys
THEIRSTACK_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
SIGNALHIRE_API_KEY=your_key_here

# Optional
ANTHROPIC_API_KEY=your_key_here
```

**Important:** Keep your API keys secure. Never commit them to Git.

### Step 4: Deploy

1. Click "Create Web Service"
2. Render will:
   - Clone your repository
   - Run `npm install`
   - Run `npm start`
   - Create public URL

3. Wait for deployment (3-5 minutes)
4. Check logs for any errors

### Step 5: Initialize Knowledge Base

After first deployment:

```bash
# Using Render Shell
# Navigate to Shell tab in Render dashboard
npm run setup-kb
```

Or use the Render API:
```bash
curl -X POST https://your-app.onrender.com/api/knowledge \
  -H "Content-Type: application/json" \
  -d '{"type":"guideline","title":"Setup","content":"..."}'
```

### Step 6: Test Production

Visit your Render URL:
```
https://jobfeeder.onrender.com
```

Run health check:
```
https://jobfeeder.onrender.com/api/health
```

Expected response:
```json
{
  "status": "ok",
  "theirstack": true,
  "gemini": true,
  "signalhire": true,
  "database": true
}
```

---

## Deployment to Heroku

### Step 1: Install Heroku CLI

```bash
# macOS
brew install heroku/brew/heroku

# Windows
# Download from https://devcenter.heroku.com/articles/heroku-cli

# Linux
curl https://cli-assets.heroku.com/install.sh | sh
```

### Step 2: Create Heroku App

```bash
heroku login
heroku create jobfeeder-gtm

# Add PostgreSQL
heroku addons:create heroku-postgresql:essential-0
```

### Step 3: Configure Environment

```bash
heroku config:set NODE_ENV=production
heroku config:set THEIRSTACK_API_KEY=your_key
heroku config:set GEMINI_API_KEY=your_key
heroku config:set SIGNALHIRE_API_KEY=your_key
```

### Step 4: Deploy

```bash
git push heroku master

# Or from a branch
git push heroku your-branch:master
```

### Step 5: Initialize Database & Knowledge Base

```bash
# Database tables are auto-created on first run

# Setup knowledge base
heroku run npm run setup-kb
```

### Step 6: Scale and Monitor

```bash
# Scale up (if needed)
heroku ps:scale web=1

# View logs
heroku logs --tail

# Open app
heroku open
```

---

## Self-Hosted Deployment (VPS)

### Prerequisites
- Ubuntu 22.04 server
- Root or sudo access
- Domain name (optional)

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install PostgreSQL (if not using Render)
sudo apt install postgresql postgresql-contrib
```

### Step 2: Setup PostgreSQL (if self-hosting database)

```bash
# Create database and user
sudo -u postgres psql

CREATE DATABASE jobfeeder;
CREATE USER jobfeeder_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE jobfeeder TO jobfeeder_user;
\q
```

### Step 3: Deploy Application

```bash
# Create app directory
sudo mkdir -p /var/www/jobfeeder
cd /var/www/jobfeeder

# Clone repository
git clone https://github.com/yourusername/jobfeeder.git .

# Install dependencies
npm install --production

# Create .env file
sudo nano .env
# Add your environment variables
```

### Step 4: Setup PM2 (Process Manager)

```bash
# Install PM2
sudo npm install -g pm2

# Start application
pm2 start server-postgres.js --name jobfeeder

# Auto-start on boot
pm2 startup systemd
pm2 save
```

### Step 5: Setup Nginx (Reverse Proxy)

```bash
# Install Nginx
sudo apt install nginx

# Create config
sudo nano /etc/nginx/sites-available/jobfeeder
```

Add configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable site:
```bash
sudo ln -s /etc/nginx/sites-available/jobfeeder /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### Step 6: Setup SSL with Let's Encrypt

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Get certificate
sudo certbot --nginx -d yourdomain.com

# Auto-renewal
sudo certbot renew --dry-run
```

### Step 7: Firewall Setup

```bash
# Allow HTTP, HTTPS, and SSH
sudo ufw allow 22
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

### Step 8: Monitor Application

```bash
# View logs
pm2 logs jobfeeder

# View status
pm2 status

# Restart
pm2 restart jobfeeder

# Monitor
pm2 monit
```

---

## Environment Variables Reference

### Required
```env
# Database
DATABASE_URL=postgresql://user:pass@host:port/database

# APIs (at least one AI API required)
THEIRSTACK_API_KEY=your_key
GEMINI_API_KEY=your_key  # or ANTHROPIC_API_KEY
SIGNALHIRE_API_KEY=your_key
```

### Optional
```env
# Server
NODE_ENV=production
PORT=3000

# Alternative AI
ANTHROPIC_API_KEY=your_key

# Email notifications (future feature)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_app_password
NOTIFICATION_EMAIL=your_email@gmail.com
```

---

## Production Checklist

### Before Deployment
- [ ] All API keys added to environment
- [ ] `.env` file not committed to Git
- [ ] Database URL configured
- [ ] Repository pushed to GitHub/GitLab
- [ ] Dependencies installed locally and tested

### After Deployment
- [ ] Health check returns OK
- [ ] Database tables created
- [ ] Knowledge base populated
- [ ] Job search works
- [ ] Folder creation works
- [ ] Company enrichment runs
- [ ] Notifications appear
- [ ] Export functionality works

### Security
- [ ] Environment variables secure
- [ ] Database password strong
- [ ] SSL certificate installed (if custom domain)
- [ ] Firewall configured
- [ ] Regular backups scheduled

### Monitoring
- [ ] Error logging configured
- [ ] Uptime monitoring (UptimeRobot, etc.)
- [ ] Database backups enabled
- [ ] API usage tracking

---

## Database Backup

### Render.com
Automatic daily backups on paid plans.

Manual backup:
```bash
# From Render dashboard
# Database → Backups → Create Backup
```

### Heroku
```bash
heroku pg:backups:capture
heroku pg:backups:download
```

### Self-Hosted
```bash
# Backup
pg_dump jobfeeder > backup.sql

# Restore
psql jobfeeder < backup.sql

# Automated daily backup (crontab)
0 2 * * * pg_dump jobfeeder > /backups/jobfeeder-$(date +\%Y\%m\%d).sql
```

---

## Scaling Considerations

### Vertical Scaling
- Upgrade to larger instance
- More CPU/RAM for background tasks
- Render: Starter → Standard → Pro

### Horizontal Scaling
- Multiple web instances (load balancer needed)
- Separate worker process for background tasks
- Redis queue for task management

### Database Optimization
- Add indexes for frequent queries (already done)
- Connection pooling (already implemented)
- Read replicas for high traffic

### Caching
- Job search already cached (4 hours)
- Consider Redis for session storage
- CDN for static assets

---

## Monitoring & Logging

### Recommended Tools

**Uptime Monitoring:**
- UptimeRobot (free)
- Pingdom
- StatusCake

**Error Tracking:**
- Sentry
- Rollbar
- Bugsnag

**Performance Monitoring:**
- New Relic
- Datadog
- AppSignal

**Log Management:**
- Logtail
- Papertrail
- LogDNA

### Setup Sentry (Error Tracking)

```bash
npm install @sentry/node
```

In `server-postgres.js`:
```javascript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

// Error handler
app.use(Sentry.Handlers.errorHandler());
```

---

## Maintenance

### Regular Tasks
- Review failed enrichments weekly
- Clear old notifications monthly
- Check database size monthly
- Update dependencies quarterly
- Review API usage weekly

### Update Deployment

**Render (auto-deploy):**
```bash
git push origin master
# Automatically deploys
```

**Heroku:**
```bash
git push heroku master
```

**Self-hosted:**
```bash
cd /var/www/jobfeeder
git pull
npm install
pm2 restart jobfeeder
```

---

## Rollback

### Render
1. Go to deployment history
2. Click "Rollback" on previous deployment

### Heroku
```bash
heroku releases
heroku rollback v123
```

### Self-hosted
```bash
cd /var/www/jobfeeder
git checkout previous-commit-hash
npm install
pm2 restart jobfeeder
```

---

## Cost Estimates

### Minimal Setup (Development)
- Render Free: $0/month
- PostgreSQL (shared): $0/month
- Total: **$0/month**

### Basic Setup (Small Production)
- Render Starter: $7/month
- PostgreSQL Essential: $7/month (included with Render)
- Total: **$7/month**

### Standard Setup (Production)
- Render Standard: $25/month
- PostgreSQL Standard: Included
- Total: **$25/month**

### API Costs (Variable)
- Theirstack: Depends on plan
- Gemini: Pay-as-you-go (~$0.02/1K requests)
- SignalHire: Depends on plan (~$99/month for 500 emails)

---

## Troubleshooting Production

### Application Won't Start
```bash
# Check logs
heroku logs --tail  # Heroku
pm2 logs jobfeeder  # Self-hosted

# Common issues:
# - Missing environment variables
# - Database connection failed
# - Port already in use
```

### Database Connection Errors
```bash
# Test connection
psql $DATABASE_URL

# Check SSL requirement
# Render requires: ssl: { rejectUnauthorized: false }
```

### High Memory Usage
```bash
# Check process
pm2 monit

# Increase memory limit
pm2 start server-postgres.js --max-memory-restart 500M
```

### Slow Background Tasks
- Check PostgreSQL connection pool size
- Monitor API rate limits
- Review task queue length
- Consider separate worker process

---

## Support

For deployment issues:
- Check server logs first
- Review environment variables
- Test database connection
- Verify API keys are valid
- Email: support@insightstap.com

---

## Next Steps After Deployment

1. **Custom Domain** - Point your domain to Render/Heroku
2. **Email Notifications** - Configure SMTP
3. **Authentication** - Add user login (if multi-user)
4. **Analytics** - Track usage and conversion
5. **CRM Integration** - Auto-sync to HubSpot/Salesforce
6. **Monitoring** - Set up alerts for errors
7. **Backup Strategy** - Automate database backups

---

**Deployment Status Checklist:**

- [ ] Production server running
- [ ] Health check passing
- [ ] Knowledge base populated
- [ ] First test campaign completed
- [ ] Monitoring configured
- [ ] Backups scheduled
- [ ] Team notified

**Go Live! 🚀**
