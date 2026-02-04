// JobFeeder - Frontend Application
const SEARCH_HISTORY_KEY = 'jobfeeder_search_history';
const JOB_FOLDERS_KEY = 'jobfeeder_job_folders';
const LAST_FOLDER_KEY = 'jobfeeder_last_folder';
const MAX_HISTORY_ITEMS = 20;

// State
let currentPage = 0;
let totalResults = 0;
let currentSearchParams = null;
let jobsCache = [];
let claudeEnabled = false;
let searchHistory = [];
let jobFolders = []; // Array of { id, name, jobs: [], createdAt, updatedAt }
let lastUsedFolderId = null;

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
    // Search history
    searchHistoryList: $('searchHistoryList'),
    clearHistoryBtn: $('clearHistoryBtn'),
    // Job folders
    jobFoldersSidebar: $('jobFoldersSidebar'),
    totalJobsCount: $('totalJobsCount'),
    newFolderName: $('newFolderName'),
    createFolderBtn: $('createFolderBtn'),
    foldersList: $('foldersList'),
    toggleFoldersBtn: $('toggleFoldersBtn'),
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
    postedDays: $('postedDays'),
    resultsLimit: $('resultsLimit'),
    sortBy: $('sortBy')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkApiStatus();
    loadSearchHistory();
    loadJobFolders();
    elements.searchForm.addEventListener('submit', handleSearch);
    elements.resetBtn.addEventListener('click', resetForm);
    elements.clearHistoryBtn.addEventListener('click', clearSearchHistory);
    elements.jobModal.addEventListener('click', (e) => {
        if (e.target === elements.jobModal) closeModal();
    });
    // Folder event listeners
    elements.toggleFoldersBtn.addEventListener('click', toggleFolders);
    elements.createFolderBtn.addEventListener('click', createNewFolder);
    elements.newFolderName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createNewFolder();
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
        posted_at_max_age_days: parseInt(elements.postedDays.value) || 15,
        limit: parseInt(elements.resultsLimit.value),
        page: currentPage,
        order_by: [{ desc: true, field: elements.sortBy.value }],
        include_total_results: true,
        blur_company_data: false
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
        console.log('Search params:', JSON.stringify(currentSearchParams, null, 2));

        const response = await fetch('/api/jobs/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentSearchParams)
        });

        const data = await response.json();
        console.log('API response:', data);

        if (!response.ok) {
            throw new Error(data.error || `API error: ${response.status}`);
        }

        totalResults = data.total || data.metadata?.total_results || 0;
        jobsCache = data.data || [];
        const isCached = data._cached;
        const cacheAge = data._cacheAge;
        console.log(`Got ${jobsCache.length} jobs out of ${totalResults} total${isCached ? ` (cached: ${cacheAge})` : ''}`);
        displayResults(jobsCache, isCached, cacheAge);
        updatePagination();

        // Save to history on first page only
        if (currentSearchParams.page === 0) {
            saveSearchToHistory(currentSearchParams, totalResults);
        }

    } catch (error) {
        console.error('Search error:', error);
        showError(error.message || 'Failed to search jobs. Please try again.');
        elements.resultsSection.style.display = 'none';
    } finally {
        showLoading(false);
    }
}

// Display search results
function displayResults(jobs, isCached = false, cacheAge = null) {
    elements.resultsSection.style.display = 'block';

    let countText = `${totalResults.toLocaleString()} job${totalResults !== 1 ? 's' : ''} found`;
    if (isCached && cacheAge) {
        countText += ` <span class="cache-badge" title="Results from cache">Cached (${cacheAge})</span>`;
    }
    elements.resultsCount.innerHTML = countText;

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

    // Check which folders contain this job
    const jobInFolders = getJobFolders(job, companyName);
    const folderButton = jobInFolders.length > 0
        ? `<button class="btn-add-folder btn-in-folder" onclick="showFolderPicker(${index})" title="In: ${jobInFolders.map(f => f.name).join(', ')}">
            <span class="folder-icon">&#128193;</span>
            <span class="folder-count">${jobInFolders.length}</span>
           </button>`
        : `<button class="btn-add-folder" onclick="showFolderPicker(${index})" title="Add to folder">
            <span class="folder-icon">+</span>
           </button>`;

    return `
        <div class="job-card" data-job-id="${job.id || index}">
            <div class="job-card-header">
                ${logoHtml}
                <div class="job-card-title">
                    <h3>${escapeHtml(job.job_title || 'Untitled Position')}</h3>
                    <span class="company-name">${escapeHtml(companyName)}</span>
                </div>
                ${folderButton}
            </div>

            <div class="job-card-meta">${metaTags}</div>

            <div class="company-info">${companyInfoHtml}</div>

            ${techHtml}

            <div class="job-card-actions">
                <button class="btn-details" onclick="showJobDetails(${index})">Details</button>
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

// Search History Functions
function loadSearchHistory() {
    try {
        const stored = localStorage.getItem(SEARCH_HISTORY_KEY);
        searchHistory = stored ? JSON.parse(stored) : [];
        renderSearchHistory();
    } catch (e) {
        console.error('Failed to load search history:', e);
        searchHistory = [];
    }
}

function saveSearchToHistory(params, resultsCount) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        params: { ...params },
        resultsCount: resultsCount,
        criteria: buildCriteriaSummary(params)
    };

    // Remove duplicate searches (same job title and key criteria)
    searchHistory = searchHistory.filter(item =>
        item.criteria.title !== historyItem.criteria.title ||
        JSON.stringify(item.params) !== JSON.stringify(historyItem.params)
    );

    // Add to beginning
    searchHistory.unshift(historyItem);

    // Keep only last MAX_HISTORY_ITEMS
    if (searchHistory.length > MAX_HISTORY_ITEMS) {
        searchHistory = searchHistory.slice(0, MAX_HISTORY_ITEMS);
    }

    // Save to localStorage
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch (e) {
        console.error('Failed to save search history:', e);
    }

    renderSearchHistory();
}

function buildCriteriaSummary(params) {
    const criteria = {
        title: '',
        tags: []
    };

    // Job title
    if (params.job_title_pattern_or) {
        criteria.title = params.job_title_pattern_or.join(', ');
    }

    // Location
    if (params.job_location_pattern_or) {
        criteria.tags.push(params.job_location_pattern_or.join(', '));
    }

    // Country
    if (params.job_country_code_or) {
        criteria.tags.push(params.job_country_code_or.join(', '));
    }

    // Remote
    if (params.remote) {
        criteria.tags.push('Remote');
    }

    // Seniority
    if (params.job_seniority_or) {
        criteria.tags.push(params.job_seniority_or.map(s => formatSeniority(s)).join(', '));
    }

    // Industry
    if (params.industry_or) {
        criteria.tags.push(params.industry_or.join(', '));
    }

    // Employee count
    if (params.min_employee_count || params.max_employee_count) {
        const min = params.min_employee_count || '1';
        const max = params.max_employee_count || '+';
        criteria.tags.push(`${min}-${max} employees`);
    }

    // YC only
    if (params.only_yc_companies) {
        criteria.tags.push('YC');
    }

    // Funding
    if (params.funding_stage_or) {
        criteria.tags.push(params.funding_stage_or.map(s => formatFundingStage(s)).join(', '));
    }

    return criteria;
}

function formatSeniority(seniority) {
    const map = {
        'intern': 'Intern',
        'junior': 'Junior',
        'mid_level': 'Mid',
        'senior': 'Senior',
        'staff': 'Staff',
        'c_level': 'C-Level'
    };
    return map[seniority] || seniority;
}

function renderSearchHistory() {
    if (searchHistory.length === 0) {
        elements.searchHistoryList.innerHTML = '<p class="no-history">No saved searches yet</p>';
        return;
    }

    elements.searchHistoryList.innerHTML = searchHistory.map(item => `
        <div class="search-history-item" data-id="${item.id}">
            <button class="history-item-delete" onclick="deleteHistoryItem(event, ${item.id})" title="Delete">&times;</button>
            <div class="history-item-title">
                ${escapeHtml(item.criteria.title || 'Untitled Search')}
                <span class="results-badge">${item.resultsCount}</span>
            </div>
            ${item.criteria.tags.length > 0 ? `
                <div class="history-item-criteria">
                    ${item.criteria.tags.slice(0, 4).map(tag => `<span class="history-criteria-tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            ` : ''}
            <div class="history-item-date">${formatHistoryDate(item.timestamp)}</div>
        </div>
    `).join('');

    // Add click handlers for loading searches
    elements.searchHistoryList.querySelectorAll('.search-history-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (!e.target.classList.contains('history-item-delete')) {
                const id = parseInt(el.dataset.id);
                loadSearchFromHistory(id);
            }
        });
    });
}

function formatHistoryDate(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function loadSearchFromHistory(id) {
    const item = searchHistory.find(h => h.id === id);
    if (!item) return;

    // Restore form values from params
    restoreFormFromParams(item.params);

    // Trigger search
    currentPage = 0;
    currentSearchParams = { ...item.params, page: 0 };
    performSearch();
}

function restoreFormFromParams(params) {
    // Reset form first
    elements.searchForm.reset();

    // Job title
    if (params.job_title_pattern_or) {
        elements.jobTitle.value = params.job_title_pattern_or.join(', ');
    }

    // Seniority
    if (params.job_seniority_or) {
        setSelectedValues(elements.jobSeniority, params.job_seniority_or);
    }

    // Location
    if (params.job_location_pattern_or) {
        elements.jobLocation.value = params.job_location_pattern_or.join(', ');
    }

    // Country
    if (params.job_country_code_or) {
        setSelectedValues(elements.jobCountry, params.job_country_code_or);
    }

    // Remote
    elements.remoteOnly.checked = !!params.remote;

    // Employees
    if (params.min_employee_count) {
        elements.minEmployees.value = params.min_employee_count;
    }
    if (params.max_employee_count) {
        elements.maxEmployees.value = params.max_employee_count;
    }

    // Industry
    if (params.industry_or) {
        elements.industry.value = params.industry_or.join(', ');
    }

    // Funding stage
    if (params.funding_stage_or) {
        setSelectedValues(elements.fundingStage, params.funding_stage_or);
    }

    // YC only
    elements.ycOnly.checked = !!params.only_yc_companies;

    // Technologies
    if (params.company_technology_slug_or) {
        elements.technologies.value = params.company_technology_slug_or.join(', ');
    }

    // Exclude companies
    if (params.company_name_not) {
        elements.excludeCompanies.value = params.company_name_not.join(', ');
    }

    // Posted days
    if (params.posted_at_max_age_days) {
        elements.postedDays.value = params.posted_at_max_age_days;
    }

    // Results limit
    if (params.limit) {
        elements.resultsLimit.value = params.limit;
    }

    // Sort by
    if (params.order_by && params.order_by[0]) {
        elements.sortBy.value = params.order_by[0].field;
    }
}

function setSelectedValues(selectElement, values) {
    Array.from(selectElement.options).forEach(option => {
        option.selected = values.includes(option.value);
    });
}

function deleteHistoryItem(event, id) {
    event.stopPropagation();
    searchHistory = searchHistory.filter(item => item.id !== id);
    try {
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(searchHistory));
    } catch (e) {
        console.error('Failed to save search history:', e);
    }
    renderSearchHistory();
}

function clearSearchHistory() {
    if (confirm('Are you sure you want to clear all search history?')) {
        searchHistory = [];
        try {
            localStorage.removeItem(SEARCH_HISTORY_KEY);
        } catch (e) {
            console.error('Failed to clear search history:', e);
        }
        renderSearchHistory();
    }
}

// Job Details Modal
function showJobDetails(index) {
    const job = jobsCache[index];
    if (!job) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';

    // Build comprehensive details HTML
    let detailsHtml = `
        <div class="modal-header">
            <h2>${escapeHtml(job.job_title || 'Untitled Position')}</h2>
            <p>${escapeHtml(companyName)}</p>
        </div>
        <div class="job-details-content">
    `;

    // Basic Info Section
    detailsHtml += `<div class="details-section"><h4>Job Information</h4><div class="details-grid">`;
    if (job.short_location || job.location) detailsHtml += `<div class="detail-item"><span class="detail-label">Location</span><span class="detail-value">${escapeHtml(job.short_location || job.location)}</span></div>`;
    if (job.date_posted) detailsHtml += `<div class="detail-item"><span class="detail-label">Posted</span><span class="detail-value">${escapeHtml(job.date_posted)}</span></div>`;
    if (job.salary_string) detailsHtml += `<div class="detail-item"><span class="detail-label">Salary</span><span class="detail-value">${escapeHtml(job.salary_string)}</span></div>`;
    if (job.remote !== undefined) detailsHtml += `<div class="detail-item"><span class="detail-label">Remote</span><span class="detail-value">${job.remote ? 'Yes' : 'No'}</span></div>`;
    if (job.job_type) detailsHtml += `<div class="detail-item"><span class="detail-label">Job Type</span><span class="detail-value">${escapeHtml(job.job_type)}</span></div>`;
    if (job.seniority) detailsHtml += `<div class="detail-item"><span class="detail-label">Seniority</span><span class="detail-value">${escapeHtml(formatSeniority(job.seniority))}</span></div>`;
    detailsHtml += `</div></div>`;

    // Company Info Section
    detailsHtml += `<div class="details-section"><h4>Company Information</h4><div class="details-grid">`;
    if (company.name) detailsHtml += `<div class="detail-item"><span class="detail-label">Company</span><span class="detail-value">${escapeHtml(company.name)}</span></div>`;
    if (company.domain) detailsHtml += `<div class="detail-item"><span class="detail-label">Website</span><span class="detail-value"><a href="https://${escapeHtml(company.domain)}" target="_blank">${escapeHtml(company.domain)}</a></span></div>`;
    if (company.industry) detailsHtml += `<div class="detail-item"><span class="detail-label">Industry</span><span class="detail-value">${escapeHtml(company.industry)}</span></div>`;
    if (company.employee_count) detailsHtml += `<div class="detail-item"><span class="detail-label">Employees</span><span class="detail-value">${company.employee_count.toLocaleString()}</span></div>`;
    if (company.founded_year) detailsHtml += `<div class="detail-item"><span class="detail-label">Founded</span><span class="detail-value">${company.founded_year}</span></div>`;
    if (company.country) detailsHtml += `<div class="detail-item"><span class="detail-label">HQ Country</span><span class="detail-value">${escapeHtml(company.country)}</span></div>`;
    if (company.city) detailsHtml += `<div class="detail-item"><span class="detail-label">HQ City</span><span class="detail-value">${escapeHtml(company.city)}</span></div>`;
    if (company.funding_stage) detailsHtml += `<div class="detail-item"><span class="detail-label">Funding Stage</span><span class="detail-value">${escapeHtml(formatFundingStage(company.funding_stage))}</span></div>`;
    if (company.total_funding_usd) detailsHtml += `<div class="detail-item"><span class="detail-label">Total Funding</span><span class="detail-value">$${formatNumber(company.total_funding_usd)}</span></div>`;
    if (company.annual_revenue_usd_readable) detailsHtml += `<div class="detail-item"><span class="detail-label">Annual Revenue</span><span class="detail-value">${escapeHtml(company.annual_revenue_usd_readable)}</span></div>`;
    if (company.linkedin_url) detailsHtml += `<div class="detail-item"><span class="detail-label">LinkedIn</span><span class="detail-value"><a href="${escapeHtml(company.linkedin_url)}" target="_blank">View Profile</a></span></div>`;
    detailsHtml += `</div></div>`;

    // Technologies
    const technologies = job.technology_slugs || company.technology_names || [];
    if (technologies.length > 0) {
        detailsHtml += `<div class="details-section"><h4>Technologies</h4><div class="technologies">${technologies.map(t => `<span class="tech-tag">${escapeHtml(t)}</span>`).join('')}</div></div>`;
    }

    // Description
    if (job.description) {
        detailsHtml += `<div class="details-section"><h4>Job Description</h4><div class="job-description">${escapeHtml(job.description)}</div></div>`;
    }

    // Raw data for debugging/reference
    detailsHtml += `<div class="details-section collapsible"><h4 onclick="toggleRawData(this)">Raw Data (click to expand)</h4><pre class="raw-data" style="display:none;">${escapeHtml(JSON.stringify(job, null, 2))}</pre></div>`;

    detailsHtml += `</div>`;

    // Action buttons
    const jobUrl = job.url || job.final_url || '#';
    const jobInFolders = getJobFolders(job, companyName);
    const folderText = jobInFolders.length > 0
        ? `In ${jobInFolders.length} folder${jobInFolders.length > 1 ? 's' : ''}: ${jobInFolders.map(f => f.name).join(', ')}`
        : 'Add to Folder';
    detailsHtml += `
        <div class="modal-actions">
            <a href="${escapeHtml(jobUrl)}" target="_blank" rel="noopener noreferrer" class="btn-primary">View Original Posting</a>
            <button class="btn-add-to-folder ${jobInFolders.length > 0 ? 'has-folders' : ''}" onclick="showFolderPicker(${index})">${folderText}</button>
        </div>
    `;

    elements.modalBody.innerHTML = detailsHtml;
    elements.jobModal.style.display = 'flex';
}

function toggleRawData(header) {
    const pre = header.nextElementSibling;
    pre.style.display = pre.style.display === 'none' ? 'block' : 'none';
}

// Job Folder Functions - Overridden by app-folder-integration.js to use PostgreSQL API
// These stubs remain for compatibility but are replaced at runtime
function loadJobFolders() {
    console.warn('loadJobFolders stub - will be overridden by app-folder-integration.js');
    jobFolders = [];
}

function saveFolders() {
    console.warn('saveFolders stub - will be overridden by app-folder-integration.js');
}

function saveLastUsedFolder(folderId) {
    console.warn('saveLastUsedFolder stub - will be overridden by app-folder-integration.js');
}

function createNewFolder() {
    const name = elements.newFolderName.value.trim();
    if (!name) {
        alert('Please enter a folder name');
        return;
    }

    // Check for duplicate name
    if (jobFolders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        alert('A folder with this name already exists');
        return;
    }

    const folder = {
        id: Date.now().toString(),
        name: name,
        jobs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    jobFolders.unshift(folder);
    saveFolders();
    saveLastUsedFolder(folder.id);
    elements.newFolderName.value = '';
    renderFolders();
}

function getJobFolders(job, companyName) {
    const jobId = job.id || `${job.job_title}-${companyName}`;
    return jobFolders.filter(folder =>
        folder.jobs.some(j => j.id === jobId || (j.job_title === job.job_title && j.company === companyName))
    );
}

function isJobInFolder(job, companyName, folderId) {
    const folder = jobFolders.find(f => f.id === folderId);
    if (!folder) return false;
    const jobId = job.id || `${job.job_title}-${companyName}`;
    return folder.jobs.some(j => j.id === jobId || (j.job_title === job.job_title && j.company === companyName));
}

function addJobToFolder(index, folderId) {
    const job = jobsCache[index];
    if (!job) return;

    const folder = jobFolders.find(f => f.id === folderId);
    if (!folder) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';

    // Check if already in this folder
    if (isJobInFolder(job, companyName, folderId)) {
        return;
    }

    const jobItem = {
        id: job.id || `${job.job_title}-${companyName}-${Date.now()}`,
        job_title: job.job_title,
        company: companyName,
        location: job.short_location || job.location,
        url: job.url || job.final_url,
        salary_string: job.salary_string,
        date_posted: job.date_posted,
        description: job.description,
        company_object: company,
        addedAt: new Date().toISOString()
    };

    folder.jobs.push(jobItem);
    folder.updatedAt = new Date().toISOString();

    // Move folder to top (most recently used)
    jobFolders = jobFolders.filter(f => f.id !== folderId);
    jobFolders.unshift(folder);

    saveFolders();
    saveLastUsedFolder(folderId);
    renderFolders();
    updateTotalJobsCount();
    displayResults(jobsCache);
    closeModal();

    // Trigger company enrichment in background
    if (company.domain) {
        triggerCompanyEnrichment(company);
    }
}

function removeJobFromFolder(jobId, folderId) {
    const folder = jobFolders.find(f => f.id === folderId);
    if (!folder) return;

    folder.jobs = folder.jobs.filter(j => j.id !== jobId);
    folder.updatedAt = new Date().toISOString();

    saveFolders();
    renderFolders();
    updateTotalJobsCount();
    displayResults(jobsCache);
}

function deleteFolder(folderId) {
    const folder = jobFolders.find(f => f.id === folderId);
    if (!folder) return;

    if (!confirm(`Delete folder "${folder.name}" and all ${folder.jobs.length} jobs in it?`)) return;

    jobFolders = jobFolders.filter(f => f.id !== folderId);
    saveFolders();

    if (lastUsedFolderId === folderId) {
        lastUsedFolderId = jobFolders.length > 0 ? jobFolders[0].id : null;
        saveLastUsedFolder(lastUsedFolderId || '');
    }

    renderFolders();
    updateTotalJobsCount();
    displayResults(jobsCache);
}

function exportFolder(folderId) {
    const folder = jobFolders.find(f => f.id === folderId);
    if (!folder || folder.jobs.length === 0) {
        alert('Folder is empty');
        return;
    }

    const csv = generateCSV(folder.jobs);
    downloadFile(csv, `${folder.name}.csv`, 'text/csv');
}

function toggleFolders() {
    elements.jobFoldersSidebar.classList.toggle('expanded');
}

function toggleFolderExpand(folderId) {
    const folderEl = document.querySelector(`.folder-item[data-id="${folderId}"]`);
    if (folderEl) {
        folderEl.classList.toggle('expanded');
    }
}

function updateTotalJobsCount() {
    const total = jobFolders.reduce((sum, folder) => sum + folder.jobs.length, 0);
    elements.totalJobsCount.textContent = total;
}

function renderFolders() {
    if (jobFolders.length === 0) {
        elements.foldersList.innerHTML = '<p class="no-folders">No folders yet. Create one above.</p>';
        return;
    }

    elements.foldersList.innerHTML = jobFolders.map(folder => `
        <div class="folder-item" data-id="${folder.id}">
            <div class="folder-header" onclick="toggleFolderExpand('${folder.id}')">
                <span class="folder-expand-icon">&#9658;</span>
                <span class="folder-name">${escapeHtml(folder.name)}</span>
                <span class="folder-job-count">${folder.jobs.length}</span>
                <div class="folder-actions">
                    <button class="btn-folder-export" onclick="event.stopPropagation(); exportFolder('${folder.id}')" title="Export CSV">&#8681;</button>
                    <button class="btn-folder-delete" onclick="event.stopPropagation(); deleteFolder('${folder.id}')" title="Delete folder">&times;</button>
                </div>
            </div>
            <div class="folder-jobs">
                ${folder.jobs.length === 0 ? '<p class="no-folder-jobs">No jobs in this folder</p>' :
                    folder.jobs.map(job => `
                        <div class="folder-job-item" onclick="showSavedJobDetails('${job.id}', '${folder.id}')">
                            <button class="folder-job-remove" onclick="event.stopPropagation(); removeJobFromFolder('${job.id}', '${folder.id}')">&times;</button>
                            <div class="folder-job-title">${escapeHtml(job.job_title)}</div>
                            <div class="folder-job-company">${escapeHtml(job.company)}</div>
                            ${job.url ? `<a href="${escapeHtml(job.url)}" target="_blank" class="folder-job-link" onclick="event.stopPropagation()">View</a>` : ''}
                        </div>
                    `).join('')
                }
            </div>
        </div>
    `).join('');
}

function showFolderPicker(index) {
    const job = jobsCache[index];
    if (!job) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';

    let pickerHtml = `
        <div class="modal-header">
            <h2>Add to Folder</h2>
            <p>${escapeHtml(job.job_title)} at ${escapeHtml(companyName)}</p>
        </div>
        <div class="folder-picker-content">
    `;

    if (jobFolders.length === 0) {
        pickerHtml += `
            <p class="no-folders-message">No folders yet. Create one first:</p>
            <div class="quick-create-folder">
                <input type="text" id="quickFolderName" placeholder="Folder name..." class="quick-folder-input">
                <button onclick="quickCreateFolder(${index})" class="btn-quick-create">Create & Add</button>
            </div>
        `;
    } else {
        // Show existing folders with checkboxes
        pickerHtml += `<div class="folder-picker-list">`;

        // Sort folders - last used first
        const sortedFolders = [...jobFolders].sort((a, b) => {
            if (a.id === lastUsedFolderId) return -1;
            if (b.id === lastUsedFolderId) return 1;
            return 0;
        });

        sortedFolders.forEach(folder => {
            const isInFolder = isJobInFolder(job, companyName, folder.id);
            const isLastUsed = folder.id === lastUsedFolderId;
            pickerHtml += `
                <div class="folder-picker-item ${isInFolder ? 'in-folder' : ''} ${isLastUsed ? 'last-used' : ''}"
                     onclick="toggleJobInFolder(${index}, '${folder.id}')">
                    <span class="folder-picker-check">${isInFolder ? '&#10003;' : ''}</span>
                    <span class="folder-picker-name">${escapeHtml(folder.name)}</span>
                    <span class="folder-picker-count">${folder.jobs.length} jobs</span>
                    ${isLastUsed ? '<span class="last-used-badge">Recent</span>' : ''}
                </div>
            `;
        });

        pickerHtml += `</div>`;

        // Quick create option
        pickerHtml += `
            <div class="quick-create-folder">
                <input type="text" id="quickFolderName" placeholder="Or create new folder..." class="quick-folder-input">
                <button onclick="quickCreateFolder(${index})" class="btn-quick-create">+</button>
            </div>
        `;
    }

    pickerHtml += `</div>`;

    elements.modalBody.innerHTML = pickerHtml;
    elements.jobModal.style.display = 'flex';

    // Focus on input if no folders
    if (jobFolders.length === 0) {
        setTimeout(() => document.getElementById('quickFolderName')?.focus(), 100);
    }
}

function toggleJobInFolder(index, folderId) {
    const job = jobsCache[index];
    if (!job) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';

    if (isJobInFolder(job, companyName, folderId)) {
        // Remove from folder
        const folder = jobFolders.find(f => f.id === folderId);
        if (folder) {
            const jobId = job.id || `${job.job_title}-${companyName}`;
            folder.jobs = folder.jobs.filter(j => !(j.id === jobId || (j.job_title === job.job_title && j.company === companyName)));
            folder.updatedAt = new Date().toISOString();
            saveFolders();
        }
    } else {
        addJobToFolder(index, folderId);
        return; // addJobToFolder already handles modal close and updates
    }

    // Refresh the picker
    showFolderPicker(index);
    renderFolders();
    updateTotalJobsCount();
    displayResults(jobsCache);
}

function quickCreateFolder(jobIndex) {
    const input = document.getElementById('quickFolderName');
    const name = input?.value.trim();

    if (!name) {
        alert('Please enter a folder name');
        return;
    }

    // Check for duplicate name
    if (jobFolders.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        alert('A folder with this name already exists');
        return;
    }

    const folder = {
        id: Date.now().toString(),
        name: name,
        jobs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    jobFolders.unshift(folder);
    saveFolders();
    saveLastUsedFolder(folder.id);

    // Add the job to this new folder
    addJobToFolder(jobIndex, folder.id);
}

function generateCSV(jobs) {
    const headers = ['Job Title', 'Company', 'Location', 'Salary', 'Posted Date', 'URL'];
    const rows = jobs.map(job => [
        job.job_title || '',
        job.company || '',
        job.location || '',
        job.salary_string || '',
        job.date_posted || '',
        job.url || ''
    ]);

    const csvContent = [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    return csvContent;
}

function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

// === Company Enrichment Functions ===

async function triggerCompanyEnrichment(company) {
    if (!company.domain) return;

    try {
        const response = await fetch('/api/companies/enrich', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                domain: company.domain,
                name: company.name,
                theirstack_data: company
            })
        });

        if (!response.ok) {
            console.warn('Company enrichment request failed:', await response.text());
            return;
        }

        const result = await response.json();
        console.log(`Company enrichment: ${result.status} for ${company.domain}`);

    } catch (error) {
        console.error('Failed to trigger company enrichment:', error);
        // Non-blocking - don't show error to user
    }
}

async function fetchCompanyInsights(domain) {
    try {
        const response = await fetch(`/api/companies/${encodeURIComponent(domain)}`);

        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            throw new Error('Failed to fetch company data');
        }

        return await response.json();
    } catch (error) {
        console.error('Error fetching company insights:', error);
        return null;
    }
}

function renderCompanyInsights(companyData) {
    if (!companyData || !companyData.enriched_data) {
        return '';
    }

    const data = companyData.enriched_data;

    let html = '<div class="company-insights">';
    html += '<h4>Company Insights</h4>';

    // Company Summary
    if (data.company_summary) {
        html += `
            <div class="insight-section">
                <span class="insight-label">About</span>
                <p>${escapeHtml(data.company_summary)}</p>
            </div>
        `;
    }

    // Work Culture Assessment
    if (data.work_culture_assessment) {
        html += `
            <div class="insight-section">
                <span class="insight-label">Culture</span>
                <p>${escapeHtml(data.work_culture_assessment)}</p>
            </div>
        `;
    }

    // Culture Values
    if (data.culture_values && data.culture_values.length > 0) {
        html += `
            <div class="insight-section">
                <span class="insight-label">Values</span>
                <div class="insight-tags">
                    ${data.culture_values.map(v => `<span class="insight-tag">${escapeHtml(v)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Benefits
    if (data.benefits && data.benefits.length > 0) {
        html += `
            <div class="insight-section">
                <span class="insight-label">Benefits</span>
                <div class="insight-tags">
                    ${data.benefits.map(b => `<span class="insight-tag benefit">${escapeHtml(b)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Remote Policy
    if (data.remote_policy) {
        html += `
            <div class="insight-section">
                <span class="insight-label">Remote Policy</span>
                <p>${escapeHtml(data.remote_policy)}</p>
            </div>
        `;
    }

    // Growth Signals
    if (data.growth_signals && data.growth_signals.length > 0) {
        html += `
            <div class="insight-section positive">
                <span class="insight-label">Growth Signals</span>
                <ul>
                    ${data.growth_signals.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Red Flags
    if (data.red_flags && data.red_flags.length > 0) {
        html += `
            <div class="insight-section warning">
                <span class="insight-label">Things to Consider</span>
                <ul>
                    ${data.red_flags.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Tech Stack
    if (data.tech_stack && data.tech_stack.length > 0) {
        html += `
            <div class="insight-section">
                <span class="insight-label">Tech Stack</span>
                <div class="insight-tags">
                    ${data.tech_stack.map(t => `<span class="insight-tag tech">${escapeHtml(t)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Products/Services
    if (data.products && data.products.length > 0) {
        html += `
            <div class="insight-section">
                <span class="insight-label">Products/Services</span>
                <ul>
                    ${data.products.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                </ul>
            </div>
        `;
    }

    // Scrape timestamp
    if (data.scrape_timestamp) {
        const scrapeDate = new Date(data.scrape_timestamp);
        html += `<p class="insight-timestamp">Data collected: ${scrapeDate.toLocaleDateString()}</p>`;
    }

    html += '</div>';
    return html;
}

async function showSavedJobDetails(jobId, folderId) {
    const folder = jobFolders.find(f => f.id === folderId);
    if (!folder) return;

    const job = folder.jobs.find(j => j.id === jobId);
    if (!job) return;

    const company = job.company_object || {};
    const companyName = job.company || 'Unknown Company';

    // Show modal with loading state
    elements.modalBody.innerHTML = `
        <div class="modal-header">
            <h2>${escapeHtml(job.job_title)}</h2>
            <p>${escapeHtml(companyName)}</p>
        </div>
        <div class="saved-job-content">
            <div class="job-meta-section">
                <div class="meta-item"><strong>Location:</strong> ${escapeHtml(job.location || 'Not specified')}</div>
                ${job.salary_string ? `<div class="meta-item"><strong>Salary:</strong> ${escapeHtml(job.salary_string)}</div>` : ''}
                ${job.date_posted ? `<div class="meta-item"><strong>Posted:</strong> ${formatDate(job.date_posted)}</div>` : ''}
                ${job.url ? `<div class="meta-item"><a href="${escapeHtml(job.url)}" target="_blank" rel="noopener">View Original Job Posting</a></div>` : ''}
            </div>
            ${job.description ? `<div class="job-description"><h4>Description</h4><p>${escapeHtml(job.description).substring(0, 1000)}${job.description.length > 1000 ? '...' : ''}</p></div>` : ''}
            <div class="company-insights-container">
                <div class="insights-loading">
                    <div class="spinner"></div>
                    <p>Loading company insights...</p>
                </div>
            </div>
        </div>
    `;
    elements.jobModal.style.display = 'flex';

    // Fetch company insights if we have a domain
    if (company.domain) {
        const companyData = await fetchCompanyInsights(company.domain);
        const insightsContainer = document.querySelector('.company-insights-container');

        if (companyData && companyData.enriched_data) {
            insightsContainer.innerHTML = renderCompanyInsights(companyData);
        } else if (companyData && companyData.enrichment_status === 'processing') {
            insightsContainer.innerHTML = `
                <div class="insights-pending">
                    <p>Company insights are being collected. Check back in a few minutes.</p>
                </div>
            `;
        } else if (companyData && companyData.enrichment_status === 'failed') {
            insightsContainer.innerHTML = `
                <div class="insights-error">
                    <p>Unable to collect company insights. <button onclick="retryEnrichment('${escapeHtml(company.domain)}')">Retry</button></p>
                </div>
            `;
        } else {
            insightsContainer.innerHTML = `
                <div class="insights-unavailable">
                    <p>Company insights not available.</p>
                </div>
            `;
        }
    } else {
        const insightsContainer = document.querySelector('.company-insights-container');
        insightsContainer.innerHTML = `
            <div class="insights-unavailable">
                <p>Company domain not available for insights.</p>
            </div>
        `;
    }
}

async function retryEnrichment(domain) {
    try {
        const response = await fetch(`/api/companies/${encodeURIComponent(domain)}/retry`, {
            method: 'POST'
        });

        if (response.ok) {
            const insightsContainer = document.querySelector('.company-insights-container');
            insightsContainer.innerHTML = `
                <div class="insights-pending">
                    <p>Retrying company data collection. Check back in a few minutes.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to retry enrichment:', error);
    }
}

// Global functions for inline handlers
window.goToPage = goToPage;
window.analyzeJob = analyzeJob;
window.closeModal = closeModal;
window.deleteHistoryItem = deleteHistoryItem;
window.loadSearchFromHistory = loadSearchFromHistory;
window.showJobDetails = showJobDetails;
window.toggleRawData = toggleRawData;
window.showFolderPicker = showFolderPicker;
window.toggleJobInFolder = toggleJobInFolder;
window.quickCreateFolder = quickCreateFolder;
window.toggleFolderExpand = toggleFolderExpand;
window.exportFolder = exportFolder;
window.deleteFolder = deleteFolder;
window.removeJobFromFolder = removeJobFromFolder;
window.showSavedJobDetails = showSavedJobDetails;
window.retryEnrichment = retryEnrichment;
