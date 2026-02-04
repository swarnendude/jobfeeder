# Contributing to JobFeeder

Thank you for your interest in contributing to JobFeeder! This document provides guidelines and instructions for contributing.

## Table of Contents
- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Submitting Changes](#submitting-changes)
- [Reporting Bugs](#reporting-bugs)
- [Feature Requests](#feature-requests)

---

## Code of Conduct

### Our Pledge
We are committed to providing a welcoming and inclusive environment for all contributors.

### Expected Behavior
- Be respectful and considerate
- Use welcoming and inclusive language
- Accept constructive criticism gracefully
- Focus on what's best for the community

### Unacceptable Behavior
- Harassment or discrimination
- Trolling or insulting comments
- Publishing others' private information
- Unprofessional conduct

---

## Getting Started

### Prerequisites
- Node.js 18 or higher
- PostgreSQL database access
- Basic knowledge of JavaScript/Node.js
- Familiarity with Express.js (for backend)
- Understanding of async/await patterns

### Setting Up Development Environment

1. **Fork the Repository**
   ```bash
   # Fork on GitHub, then clone your fork
   git clone https://github.com/YOUR_USERNAME/jobfeeder.git
   cd jobfeeder
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Setup Database**
   ```bash
   npm start
   # Tables will be created automatically
   ```

5. **Setup Knowledge Base**
   ```bash
   npm run setup-kb
   ```

6. **Run Tests** (when available)
   ```bash
   npm test
   ```

7. **Start Development Server**
   ```bash
   npm run dev
   ```

---

## Development Workflow

### Branching Strategy

We use Git Flow:
- `master` - Production-ready code
- `develop` - Development branch
- `feature/*` - New features
- `bugfix/*` - Bug fixes
- `hotfix/*` - Critical production fixes

### Creating a Feature Branch

```bash
git checkout develop
git pull origin develop
git checkout -b feature/your-feature-name
```

### Working on Your Feature

1. Write code following our [coding standards](#coding-standards)
2. Test your changes thoroughly
3. Update documentation if needed
4. Commit with clear messages

### Commit Message Format

Use conventional commits:

```
type(scope): subject

body (optional)

footer (optional)
```

**Types:**
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation changes
- `style` - Code style changes (formatting)
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

**Examples:**
```bash
git commit -m "feat(prospects): add LinkedIn profile scraping"
git commit -m "fix(enrichment): handle timeout errors gracefully"
git commit -m "docs(readme): update installation instructions"
```

---

## Coding Standards

### JavaScript Style Guide

#### General
- Use ES6+ features (const, let, arrow functions)
- Use async/await instead of callbacks
- Use template literals for strings
- Add JSDoc comments for functions

#### Naming Conventions
```javascript
// Variables and functions - camelCase
const userName = 'John';
function getUserData() {}

// Classes - PascalCase
class CompanyEnricher {}

// Constants - UPPER_SNAKE_CASE
const MAX_RETRIES = 3;

// Files - kebab-case
// workflow-manager.js
// db-postgres.js
```

#### Code Examples

**Good:**
```javascript
// Clear, descriptive function with JSDoc
/**
 * Enriches company data from website
 * @param {string} domain - Company domain
 * @param {string} name - Company name
 * @returns {Promise<Object>} Enriched company data
 */
async function enrichCompany(domain, name) {
    const company = await db.getCompany(domain);

    if (!company) {
        throw new Error(`Company not found: ${domain}`);
    }

    const enrichedData = await scrapeWebsite(domain);
    await db.saveEnrichedData(domain, enrichedData);

    return enrichedData;
}
```

**Bad:**
```javascript
// Unclear, no error handling, no docs
async function ec(d, n) {
    let c = await db.getCompany(d);
    let e = await scrapeWebsite(d);
    await db.saveEnrichedData(d, e);
    return e;
}
```

#### Error Handling

Always use try-catch for async operations:

```javascript
async function someOperation() {
    try {
        const result = await riskyOperation();
        return result;
    } catch (error) {
        console.error('Operation failed:', error);
        throw new Error(`Failed to complete operation: ${error.message}`);
    }
}
```

#### Database Queries

Use parameterized queries (prevents SQL injection):

```javascript
// Good
await pool.query('SELECT * FROM companies WHERE domain = $1', [domain]);

// Bad - SQL injection risk!
await pool.query(`SELECT * FROM companies WHERE domain = '${domain}'`);
```

### Frontend Standards

#### HTML
- Use semantic HTML5 elements
- Add ARIA labels for accessibility
- Keep inline styles minimal

#### CSS
- Use classes, avoid IDs for styling
- Follow BEM naming: `block__element--modifier`
- Group related styles together

#### JavaScript
- Avoid global variables
- Use event delegation where possible
- Always escape user input (XSS prevention)

```javascript
// Good - escaping HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Use it
element.innerHTML = escapeHtml(userInput);
```

---

## Testing

### Writing Tests (Future)

When test framework is added:

```javascript
describe('CompanyEnricher', () => {
    it('should enrich company data', async () => {
        const enricher = new CompanyEnricher({ db });
        const result = await enricher.enrich('acme.com', 'Acme Corp');

        expect(result.status).toBe('completed');
        expect(result.data).toBeDefined();
    });

    it('should handle enrichment errors', async () => {
        const enricher = new CompanyEnricher({ db });

        await expect(
            enricher.enrich('invalid-domain', 'Test')
        ).rejects.toThrow();
    });
});
```

### Manual Testing

Before submitting PR:
1. Test the specific feature you changed
2. Run through related workflows
3. Check for console errors
4. Test on different browsers (Chrome, Firefox)
5. Check mobile responsiveness
6. Review TESTING-CHECKLIST.md

---

## Submitting Changes

### Pull Request Process

1. **Update Documentation**
   - Update README.md if needed
   - Add API docs for new endpoints
   - Update CHANGELOG.md

2. **Self-Review**
   - Read your own code changes
   - Check for console.log statements
   - Remove commented code
   - Verify formatting

3. **Create Pull Request**
   ```bash
   git push origin feature/your-feature-name
   ```

   On GitHub:
   - Click "New Pull Request"
   - Base: `develop` ← Compare: `feature/your-feature-name`
   - Fill out PR template

4. **PR Title Format**
   ```
   [Feature] Add LinkedIn scraping to prospect collection
   [Fix] Handle timeout errors in company enrichment
   [Docs] Update API documentation
   ```

5. **PR Description Template**
   ```markdown
   ## What
   Brief description of changes

   ## Why
   Reason for changes

   ## How
   Technical implementation details

   ## Testing
   - [ ] Tested locally
   - [ ] Checked for errors
   - [ ] Updated documentation
   - [ ] Manual testing completed

   ## Screenshots (if applicable)
   [Add screenshots]

   ## Related Issues
   Closes #123
   ```

6. **Code Review**
   - Address review comments
   - Update PR with changes
   - Re-request review

7. **Merge**
   - Squash and merge (keep clean history)
   - Delete feature branch after merge

---

## Reporting Bugs

### Before Reporting

1. **Check if bug already reported**
   - Search existing issues
   - Check closed issues too

2. **Verify it's a bug**
   - Clear browser cache
   - Check console for errors
   - Try incognito mode
   - Test on different browser

3. **Reproduce consistently**
   - Can you make it happen again?
   - Note the exact steps

### Bug Report Template

```markdown
**Describe the bug**
A clear description of what the bug is.

**To Reproduce**
Steps to reproduce:
1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

**Expected behavior**
What should happen instead?

**Screenshots**
Add screenshots if applicable.

**Environment:**
- OS: [e.g. Windows 11]
- Browser: [e.g. Chrome 120]
- Node version: [e.g. 18.17.0]
- Database: [PostgreSQL version]

**Console Errors**
```
Paste any console errors here
```

**Additional context**
Any other relevant information.
```

### Priority Labels

- `critical` - System completely broken
- `high` - Major feature broken
- `medium` - Feature partially broken
- `low` - Minor issue or cosmetic

---

## Feature Requests

### Before Requesting

1. **Check existing requests**
   - Search issues with label `enhancement`

2. **Consider scope**
   - Does it fit JobFeeder's purpose?
   - Is it generally useful?
   - Can it be implemented reasonably?

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear description of the problem.

**Describe the solution you'd like**
What should the feature do?

**Describe alternatives you've considered**
Other solutions you've thought about.

**Use Case**
When would you use this feature?

**Additional context**
Mockups, examples, references, etc.
```

---

## Areas to Contribute

### High Priority
- [ ] Unit tests
- [ ] Integration tests
- [ ] User authentication
- [ ] Email notification implementation
- [ ] CRM integrations (HubSpot, Salesforce)
- [ ] Improved error messages
- [ ] Performance optimizations

### Medium Priority
- [ ] Mobile responsive improvements
- [ ] Dark mode
- [ ] Export to multiple formats (JSON, Excel)
- [ ] Advanced filtering in prospects view
- [ ] Prospect de-duplication
- [ ] Bulk operations
- [ ] Activity logging

### Low Priority
- [ ] Analytics dashboard
- [ ] Email templates
- [ ] Sequence automation
- [ ] A/B testing
- [ ] Internationalization (i18n)

### Documentation
- [ ] Video tutorials
- [ ] More code examples
- [ ] Architecture diagrams
- [ ] API client libraries (Python, etc.)
- [ ] Case studies

---

## Code Review Guidelines

### For Reviewers

**What to Look For:**
- Code follows style guide
- No security vulnerabilities
- Error handling is proper
- Code is well-documented
- Tests are included (when available)
- No performance regressions
- Database queries are optimized
- API responses are consistent

**How to Review:**
- Be constructive, not critical
- Explain the "why" behind suggestions
- Approve if changes are acceptable
- Request changes if issues found
- Use GitHub suggestions feature

**Review Checklist:**
- [ ] Code is readable and maintainable
- [ ] No console.log left in code
- [ ] Environment variables used for secrets
- [ ] SQL queries are parameterized
- [ ] User input is validated
- [ ] Errors are handled gracefully
- [ ] Documentation is updated

### For Contributors

**Responding to Reviews:**
- Don't take criticism personally
- Ask for clarification if needed
- Make requested changes promptly
- Explain your reasoning if you disagree
- Thank reviewers for their time

---

## Release Process

1. **Version Bump**
   ```bash
   npm version patch  # 1.0.0 → 1.0.1
   npm version minor  # 1.0.0 → 1.1.0
   npm version major  # 1.0.0 → 2.0.0
   ```

2. **Update CHANGELOG.md**
   ```markdown
   ## [1.1.0] - 2024-02-04
   ### Added
   - LinkedIn profile scraping
   - Bulk prospect selection

   ### Fixed
   - Timeout handling in enrichment
   - Notification badge count

   ### Changed
   - Improved AI scoring algorithm
   ```

3. **Create Release Tag**
   ```bash
   git tag -a v1.1.0 -m "Release version 1.1.0"
   git push origin v1.1.0
   ```

4. **Deploy to Production**
   - Merge to master
   - Deploy to Render/Heroku
   - Monitor for errors

---

## Security

### Reporting Security Issues

**DO NOT** open a public issue for security vulnerabilities.

Instead:
- Email: security@insightstap.com
- Include: Detailed description and steps to reproduce
- We'll respond within 48 hours

### Security Best Practices

- Never commit API keys or passwords
- Use environment variables for secrets
- Sanitize all user input
- Use parameterized queries
- Keep dependencies updated
- Enable HTTPS in production
- Implement rate limiting

---

## Communication

### Channels

- **GitHub Issues** - Bug reports, feature requests
- **GitHub Discussions** - General questions, ideas
- **Email** - support@insightstap.com
- **Twitter** - @insightstap (for updates)

### Getting Help

**Before Asking:**
1. Read the documentation
2. Search existing issues
3. Check TROUBLESHOOTING section

**When Asking:**
- Be specific
- Provide context
- Include error messages
- Share relevant code
- Mention environment details

---

## Recognition

### Contributors
All contributors will be recognized in:
- CONTRIBUTORS.md file
- GitHub contributors page
- Release notes (for significant contributions)

### Types of Contributions Valued
- Code contributions
- Documentation improvements
- Bug reports with reproduction steps
- Feature ideas and discussions
- Helping other users
- Testing and QA
- Design and UX improvements

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

## Questions?

- Read the [README.md](README.md)
- Check [QUICKSTART.md](QUICKSTART.md)
- Review [API-DOCUMENTATION.md](API-DOCUMENTATION.md)
- Open a GitHub Discussion
- Email: support@insightstap.com

---

**Thank you for contributing to JobFeeder! 🎉**

Your contributions help make GTM outreach automation better for everyone.
