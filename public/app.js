// JobFeeder - Frontend Application
const DAYS_FILTER = 15;

// State
let currentPage = 0;
let totalResults = 0;
let currentSearchParams = null;
let jobsCache = [];
let claudeEnabled = false;

// DOM Elements
const $ = (id) => document.getElementById(id);

const elements = {
    searchForm: $('searchForm'),
    searchBtn: $('searchBtn'),
    resetBtn: $('resetBtn'),
    resultsSection: $('resultsSection'),
    resultsCount: $('resultsCount'),
    jobResults: $('jobResults'),
    pagination: $('pagination'),
    loadingOverlay: $('loadingOverlay'),
    errorMessage: $('errorMessage'),
    apiStatus: $('apiStatus'),
    jobModal: $('jobModal'),
    modalBody: $('modalBody'),
    // Form inputs
    jobTitle: $('jobTitle'),
    jobSeniority: $('jobSeniority'),
    jobLocation: $('jobLocation'),
    jobCountry: $('jobCountry'),
    remoteOnly: $('remoteOnly'),
    minEmployees: $('minEmployees'),
    maxEmployees: $('maxEmployees'),
    industry: $('industry'),
    fundingStage: $('fundingStage'),
    ycOnly: $('ycOnly'),
    technologies: $('technologies'),
    excludeCompanies: $('excludeCompanies'),
    resultsLimit: $('resultsLimit'),
    sortBy: $('sortBy')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkApiStatus();
    elements.searchForm.addEventListener('submit', handleSearch);
    elements.resetBtn.addEventListener('click', resetForm);
    elements.jobModal.addEventListener('click', (e) => {
        if (e.target === elements.jobModal) closeModal();
    });
});

// Check API status
async function checkApiStatus() {
    try {
        const response = await fetch('/api/health');
        const data = await response.json();

        claudeEnabled = data.claude;

        elements.apiStatus.innerHTML = `
            <span class="status-item">
                <span class="status-dot ${data.theirstack ? 'connected' : 'disconnected'}"></span>
                Theirstack
            </span>
            <span class="status-item">
                <span class="status-dot ${data.claude ? 'connected' : 'disconnected'}"></span>
                Claude AI
            </span>
        `;
    } catch (error) {
        elements.apiStatus.innerHTML = `
            <span class="status-item">
                <span class="status-dot disconnected"></span>
                API Offline
            </span>
        `;
    }
}

// Build search parameters
function buildSearchParams() {
    const params = {
        posted_at_max_age_days: DAYS_FILTER,
        limit: parseInt(elements.resultsLimit.value),
        page: currentPage,
        order_by: [{ desc: true, field: elements.sortBy.value }],
        include_total_results: true
    };

    // Job title (required)
    const jobTitle = elements.jobTitle.value.trim();
    if (jobTitle) {
        const titles = jobTitle.split(',').map(t => t.trim()).filter(Boolean);
        if (titles.length > 0) {
            params.job_title_pattern_or = titles;
        }
    }

    // Job seniority
    const seniorityValues = getSelectedValues(elements.jobSeniority);
    if (seniorityValues.length > 0) {
        params.job_seniority_or = seniorityValues;
    }

    // Job location
    const jobLocation = elements.jobLocation.value.trim();
    if (jobLocation) {
        const locations = jobLocation.split(',').map(l => l.trim()).filter(Boolean);
        if (locations.length > 0) {
            params.job_location_pattern_or = locations;
        }
    }

    // Job country
    const jobCountries = getSelectedValues(elements.jobCountry);
    if (jobCountries.length > 0) {
        params.job_country_code_or = jobCountries;
    }

    // Remote only
    if (elements.remoteOnly.checked) {
        params.remote = true;
    }

    // Employee count
    const minEmployees = parseInt(elements.minEmployees.value);
    const maxEmployees = parseInt(elements.maxEmployees.value);
    if (!isNaN(minEmployees) && minEmployees > 0) {
        params.min_employee_count = minEmployees;
    }
    if (!isNaN(maxEmployees) && maxEmployees > 0) {
        params.max_employee_count = maxEmployees;
    }

    // Industry
    const industry = elements.industry.value.trim();
    if (industry) {
        const industries = industry.split(',').map(i => i.trim()).filter(Boolean);
        if (industries.length > 0) {
            params.industry_or = industries;
        }
    }

    // Funding stage
    const fundingStages = getSelectedValues(elements.fundingStage);
    if (fundingStages.length > 0) {
        params.funding_stage_or = fundingStages;
    }

    // Y Combinator only
    if (elements.ycOnly.checked) {
        params.only_yc_companies = true;
    }

    // Technologies
    const technologies = elements.technologies.value.trim();
    if (technologies) {
        const techList = technologies.split(',').map(t => t.trim().toLowerCase().replace(/\s+/g, '-')).filter(Boolean);
        if (techList.length > 0) {
            params.company_technology_slug_or = techList;
        }
    }

    // Exclude companies
    const excludeCompanies = elements.excludeCompanies.value.trim();
    if (excludeCompanies) {
        const excludeList = excludeCompanies.split(',').map(c => c.trim()).filter(Boolean);
        if (excludeList.length > 0) {
            params.company_name_not = excludeList;
        }
    }

    return params;
}

// Get selected values from multi-select
function getSelectedValues(selectElement) {
    return Array.from(selectElement.selectedOptions).map(opt => opt.value);
}

// Handle search form submission
async function handleSearch(e) {
    e.preventDefault();

    const jobTitle = elements.jobTitle.value.trim();
    if (!jobTitle) {
        showError('Please enter a job title to search');
        return;
    }

    currentPage = 0;
    currentSearchParams = buildSearchParams();
    await performSearch();
}

// Perform the API search
async function performSearch() {
    showLoading(true);
    hideError();

    try {
        const response = await fetch('/api/jobs/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSearchParams)
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        totalResults = data.total || data.metadata?.total_results || 0;
        jobsCache = data.data || [];
        displayResults(jobsCache);
        updatePagination();

    } catch (error) {
        console.error('Search error:', error);
        showError(error.message || 'Failed to search jobs. Please try again.');
        elements.resultsSection.style.display = 'none';
    } finally {
        showLoading(false);
    }
}

// Display search results
function displayResults(jobs) {
    elements.resultsSection.style.display = 'block';
    elements.resultsCount.textContent = `${totalResults.toLocaleString()} job${totalResults !== 1 ? 's' : ''} found`;

    if (jobs.length === 0) {
        elements.jobResults.innerHTML = `
            <div class="no-results">
                <h3>No jobs found</h3>
                <p>Try adjusting your search criteria or reducing filters.</p>
            </div>
        `;
        return;
    }

    elements.jobResults.innerHTML = jobs.map((job, index) => createJobCard(job, index)).join('');
}

// Create a job card HTML
function createJobCard(job, index) {
    const company = job.company_object || {};
    const postedDate = job.date_posted ? formatDate(job.date_posted) : 'Unknown';
    const location = job.short_location || job.location || 'Not specified';
    const companyLogo = company.logo;
    const companyInitial = (company.name || job.company || 'C').charAt(0).toUpperCase();
    const companyName = company.name || job.company || 'Unknown Company';

    // Build logo HTML
    const logoHtml = companyLogo
        ? `<img src="${escapeHtml(companyLogo)}" alt="${escapeHtml(companyName)}" class="company-logo" onerror="this.outerHTML='<div class=\\'company-logo-placeholder\\'>${companyInitial}</div>'">`
        : `<div class="company-logo-placeholder">${companyInitial}</div>`;

    // URLs
    const jobUrl = job.url || job.final_url || '#';
    const companyDomain = company.domain || job.company_domain;

    // Meta tags
    let metaTags = `<span class="meta-tag location">${escapeHtml(location)}</span>`;
    metaTags += `<span class="meta-tag date">${postedDate}</span>`;

    if (job.remote) {
        metaTags += `<span class="meta-tag remote">Remote</span>`;
    }
    if (job.salary_string) {
        metaTags += `<span class="meta-tag salary">${escapeHtml(job.salary_string)}</span>`;
    }
    if (company.employee_count) {
        metaTags += `<span class="meta-tag employees">${formatEmployeeCount(company.employee_count)}</span>`;
    }

    // Company info
    let companyInfoHtml = '<div class="company-info-grid">';
    if (company.industry) {
        companyInfoHtml += `<div class="company-info-item"><span class="company-info-label">Industry</span><span class="company-info-value">${escapeHtml(company.industry)}</span></div>`;
    }
    if (company.funding_stage) {
        companyInfoHtml += `<div class="company-info-item"><span class="company-info-label">Funding</span><span class="company-info-value">${escapeHtml(formatFundingStage(company.funding_stage))}</span></div>`;
    }
    if (company.country) {
        companyInfoHtml += `<div class="company-info-item"><span class="company-info-label">HQ</span><span class="company-info-value">${escapeHtml(company.country)}</span></div>`;
    }
    if (company.founded_year) {
        companyInfoHtml += `<div class="company-info-item"><span class="company-info-label">Founded</span><span class="company-info-value">${company.founded_year}</span></div>`;
    }
    if (company.annual_revenue_usd_readable) {
        companyInfoHtml += `<div class="company-info-item"><span class="company-info-label">Revenue</span><span class="company-info-value">${escapeHtml(company.annual_revenue_usd_readable)}</span></div>`;
    }
    if (company.total_funding_usd) {
        companyInfoHtml += `<div class="company-info-item"><span class="company-info-label">Total Funding</span><span class="company-info-value">$${formatNumber(company.total_funding_usd)}</span></div>`;
    }
    companyInfoHtml += '</div>';

    // Technologies
    const technologies = job.technology_slugs || company.technology_names || [];
    const techHtml = technologies.length > 0
        ? `<div class="technologies">${technologies.slice(0, 6).map(t => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('')}</div>`
        : '';

    // AI button
    const aiButton = claudeEnabled
        ? `<button class="btn-analyze" onclick="analyzeJob(${index})">AI Analysis</button>`
        : '';

    return `
        <div class="job-card">
            <div class="job-card-header">
                ${logoHtml}
                <div class="job-card-title">
                    <h3>${escapeHtml(job.job_title || 'Untitled Position')}</h3>
                    <span class="company-name">${escapeHtml(companyName)}</span>
                </div>
            </div>

            <div class="job-card-meta">${metaTags}</div>

            <div class="company-info">${companyInfoHtml}</div>

            ${techHtml}

            <div class="job-card-actions">
                <a href="${escapeHtml(jobUrl)}" target="_blank" rel="noopener noreferrer" class="btn-view-job">View Job</a>
                ${aiButton}
            </div>
        </div>
    `;
}

// Analyze job with Claude
async function analyzeJob(index) {
    const job = jobsCache[index];
    if (!job) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';

    elements.modalBody.innerHTML = `
        <div class="modal-header">
            <h2>${escapeHtml(job.job_title)}</h2>
            <p>${escapeHtml(companyName)}</p>
        </div>
        <div class="analysis-loading">
            <div class="spinner"></div>
            <p>Analyzing job with Claude AI...</p>
        </div>
    `;
    elements.jobModal.style.display = 'flex';

    try {
        const response = await fetch('/api/ai/analyze-job', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                job: {
                    job_title: job.job_title,
                    company: companyName,
                    location: job.short_location || job.location,
                    salary_string: job.salary_string,
                    description: job.description
                }
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to analyze job');
        }

        elements.modalBody.innerHTML = `
            <div class="modal-header">
                <h2>${escapeHtml(job.job_title)}</h2>
                <p>${escapeHtml(companyName)}</p>
            </div>
            <div class="analysis-content">${escapeHtml(data.analysis)}</div>
        `;

    } catch (error) {
        elements.modalBody.innerHTML = `
            <div class="modal-header">
                <h2>Analysis Error</h2>
            </div>
            <div class="error-message">${escapeHtml(error.message)}</div>
        `;
    }
}

// Close modal
function closeModal() {
    elements.jobModal.style.display = 'none';
}

// Update pagination controls
function updatePagination() {
    const limit = parseInt(elements.resultsLimit.value);
    const totalPages = Math.ceil(totalResults / limit);

    if (totalPages <= 1) {
        elements.pagination.innerHTML = '';
        return;
    }

    elements.pagination.innerHTML = `
        <button onclick="goToPage(${currentPage - 1})" ${currentPage === 0 ? 'disabled' : ''}>Previous</button>
        <span class="page-info">Page ${currentPage + 1} of ${totalPages}</span>
        <button onclick="goToPage(${currentPage + 1})" ${currentPage >= totalPages - 1 ? 'disabled' : ''}>Next</button>
    `;
}

// Navigate to page
async function goToPage(page) {
    currentPage = page;
    currentSearchParams.page = page;
    await performSearch();
    elements.resultsSection.scrollIntoView({ behavior: 'smooth' });
}

// Reset form
function resetForm() {
    elements.searchForm.reset();
    elements.resultsSection.style.display = 'none';
    hideError();
    currentPage = 0;
    currentSearchParams = null;
    jobsCache = [];
}

// Helper functions
function showLoading(show) {
    elements.loadingOverlay.style.display = show ? 'flex' : 'none';
    elements.searchBtn.disabled = show;
}

function showError(message) {
    elements.errorMessage.textContent = message;
    elements.errorMessage.style.display = 'block';
}

function hideError() {
    elements.errorMessage.style.display = 'none';
}

function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        const now = new Date();
        const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays}d ago`;
        if (diffDays < 14) return '1w ago';
        return `${Math.floor(diffDays / 7)}w ago`;
    } catch {
        return dateString;
    }
}

function formatEmployeeCount(count) {
    if (!count) return '';
    if (count < 10) return '1-10';
    if (count < 50) return '11-50';
    if (count < 200) return '51-200';
    if (count < 500) return '201-500';
    if (count < 1000) return '501-1K';
    if (count < 5000) return '1K-5K';
    return '5K+';
}

function formatFundingStage(stage) {
    const map = {
        'seed': 'Seed',
        'series_a': 'Series A',
        'series_b': 'Series B',
        'series_c': 'Series C',
        'series_d': 'Series D',
        'series_e': 'Series E+',
        'ipo': 'Public'
    };
    return map[stage] || stage;
}

function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Global functions for inline handlers
window.goToPage = goToPage;
window.analyzeJob = analyzeJob;
window.closeModal = closeModal;
