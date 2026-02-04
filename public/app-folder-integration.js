// Folder Integration for App.js - PostgreSQL Backend
// This file extends the existing app.js to integrate with the PostgreSQL folders API

// Global map of job IDs to folder info: { jobId: [{ folder_id, folder_name }] }
window.jobFolderMap = {};

// Cache flags to prevent multiple API calls
let foldersLoaded = false;
let mappingsLoaded = false;

// Load job-folder mappings from API (only once per session unless forced)
async function loadJobFolderMappings(forceReload = false) {
    if (mappingsLoaded && !forceReload) {
        console.log('[Folder Integration] Mappings already loaded, skipping API call');
        return;
    }

    try {
        const response = await fetch('/api/job-folder-mappings');
        if (!response.ok) {
            console.error('Failed to load job-folder mappings');
            return;
        }

        const mappings = await response.json();

        // Build map: jobId -> [{ folder_id, folder_name }]
        window.jobFolderMap = {};
        mappings.forEach(m => {
            const jobId = m.theirstack_job_id;
            if (!window.jobFolderMap[jobId]) {
                window.jobFolderMap[jobId] = [];
            }
            window.jobFolderMap[jobId].push({
                folder_id: m.folder_id.toString(),
                folder_name: m.folder_name
            });
        });

        mappingsLoaded = true;
        console.log(`[Folder Integration] Loaded ${mappings.length} job-folder mappings`);
    } catch (error) {
        console.error('Error loading job-folder mappings:', error);
    }
}

// Get folders containing a job (uses the mapping)
function getJobFoldersFromMap(job) {
    const jobId = job.id;
    if (!jobId || !window.jobFolderMap[jobId]) {
        return [];
    }
    return window.jobFolderMap[jobId];
}

// Load folders from API instead of localStorage (only once per session unless forced)
async function loadJobFolders(forceReload = false) {
    if (foldersLoaded && !forceReload) {
        console.log('[Folder Integration] Folders already loaded, skipping API call');
        return;
    }

    try {
        const response = await fetch('/api/folders');

        // Check if API endpoint exists (404 = endpoint not found, using SQLite)
        if (response.status === 404) {
            console.log('[Folder Integration] Folder API not available. Using localStorage fallback.');
            loadJobFoldersLocal();
            return;
        }

        if (!response.ok) {
            console.error('Failed to load folders from API');
            // Fallback to localStorage
            loadJobFoldersLocal();
            return;
        }

        const apiFolders = await response.json();

        // Convert API format to local format for compatibility
        const convertedFolders = apiFolders.map(f => ({
            id: f.id.toString(),
            name: f.name,
            description: f.description,
            jobs: [], // Empty array - actual jobs not loaded on folder list
            createdAt: f.created_at,
            updatedAt: f.updated_at,
            status: f.status,
            job_count: f.job_count || 0,
            prospect_count: f.prospect_count || 0
        }));

        // Set both local and window reference to ensure global scope
        jobFolders = convertedFolders;
        window.jobFolders = convertedFolders;

        // Render folders in sidebar (use original function) - only if elements exist
        // These elements only exist on folders.html, not on index.html (job search page)
        if (typeof renderFolders === 'function' && document.getElementById('foldersList')) {
            renderFolders();
        }
        if (typeof updateTotalJobsCount === 'function' && document.getElementById('totalJobsCount')) {
            updateTotalJobsCount();
        }

        foldersLoaded = true;
        console.log(`[Folder Integration] Loaded ${jobFolders.length} folders from API`);
    } catch (error) {
        console.error('Error loading folders from API:', error);
        showError('Failed to load folders. Please check your database connection.');
        jobFolders = [];
    }
}

// Removed localStorage fallback - PostgreSQL only

// Create folder using API
async function createNewFolderAPI() {
    const name = elements.newFolderName.value.trim();
    if (!name) {
        alert('Please enter a folder name');
        return;
    }

    try {
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: '' })
        });

        if (!response.ok) {
            throw new Error('Failed to create folder');
        }

        const folder = await response.json();
        elements.newFolderName.value = '';

        // Force reload folders since we created a new one
        await loadJobFolders(true);

        // Show success message
        showSuccessMessage('Folder created successfully!');
    } catch (error) {
        console.error('Error creating folder:', error);
        showError('Failed to create folder. Please check your database connection.');
    }
}

// Flag to prevent modal from reopening during add operation
let isAddingToFolder = false;

// Add job to folder using API with optimistic UI
async function addJobToFolderAPI(index, folderId) {
    // Prevent re-entry
    if (isAddingToFolder) return;
    isAddingToFolder = true;

    const job = jobsCache[index];
    if (!job) {
        isAddingToFolder = false;
        return;
    }

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';
    const companyDomain = company.domain || job.company_domain || extractDomain(companyName);

    // Get folder name for the message
    const folder = jobFolders.find(f => f.id == folderId);
    const folderName = folder ? folder.name : 'folder';

    // OPTIMISTIC UI: Close modal and show success immediately
    if (typeof closeModal === 'function') {
        closeModal();
    }
    showSuccessMessage(`Added to "${folderName}"`);

    // Optimistically update the local job-folder map
    const jobId = job.id;
    if (jobId) {
        if (!window.jobFolderMap[jobId]) {
            window.jobFolderMap[jobId] = [];
        }
        // Check if already in this folder
        const alreadyIn = window.jobFolderMap[jobId].some(f => f.folder_id === folderId.toString());
        if (!alreadyIn) {
            window.jobFolderMap[jobId].push({
                folder_id: folderId.toString(),
                folder_name: folderName
            });
        }
    }

    // Re-render current results to update folder indicators immediately
    if (typeof displayResults === 'function' && typeof jobsCache !== 'undefined') {
        displayResults(jobsCache.slice(currentPage * 50, (currentPage + 1) * 50));
    }

    // Reset flag after a short delay to allow UI to settle
    setTimeout(() => { isAddingToFolder = false; }, 500);

    // Make API call in background
    try {
        const response = await fetch(`/api/folders/${folderId}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: job.id,
                theirstack_job_id: job.id,
                job_title: job.job_title,
                company: companyName,
                domain: companyDomain,
                location: job.short_location || job.location,
                country: extractCountry(job.short_location || job.location),
                salary_string: job.salary_string,
                description: job.description,
                url: job.url || job.final_url,
                posted_date: job.date_posted,
                employee_count: company.employee_count,
                theirstack_company_data: company,
                raw_data: job
            })
        });

        if (!response.ok) {
            throw new Error('Failed to add job to folder');
        }

        // No need to reload - optimistic update is already in place
        // The mapping will be refreshed on next page load or when picker is opened

    } catch (error) {
        console.error('Error adding job to folder:', error);

        // Revert optimistic update on failure
        if (jobId && window.jobFolderMap[jobId]) {
            window.jobFolderMap[jobId] = window.jobFolderMap[jobId].filter(
                f => f.folder_id !== folderId.toString()
            );
        }

        // Show error
        showError('Failed to add job to folder. Please try again.');

        // Re-render to show reverted state
        if (typeof displayResults === 'function' && typeof jobsCache !== 'undefined') {
            displayResults(jobsCache.slice(currentPage * 50, (currentPage + 1) * 50));
        }
    }
}

// Remove job from folder using API with optimistic UI
async function removeJobFromFolderAPI(index, folderId) {
    const job = jobsCache[index];
    if (!job) return;

    const jobId = job.id;
    if (!jobId) return;

    // Get folder name for the message
    const folder = jobFolders.find(f => f.id == folderId);
    const folderName = folder ? folder.name : 'folder';

    // OPTIMISTIC UI: Update map and show success immediately
    if (window.jobFolderMap[jobId]) {
        window.jobFolderMap[jobId] = window.jobFolderMap[jobId].filter(
            f => f.folder_id !== folderId.toString()
        );
    }
    showSuccessMessage(`Removed from "${folderName}"`);

    // Re-render to update folder indicators
    if (typeof displayResults === 'function' && typeof jobsCache !== 'undefined') {
        displayResults(jobsCache.slice(currentPage * 50, (currentPage + 1) * 50));
    }

    // Refresh the picker to show updated state
    if (window._originalShowFolderPicker) {
        window._originalShowFolderPicker(index);
    }

    // Make API call in background
    try {
        const response = await fetch(`/api/folders/${folderId}/jobs/${jobId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to remove job from folder');
        }

    } catch (error) {
        console.error('Error removing job from folder:', error);

        // Revert optimistic update on failure
        if (!window.jobFolderMap[jobId]) {
            window.jobFolderMap[jobId] = [];
        }
        window.jobFolderMap[jobId].push({
            folder_id: folderId.toString(),
            folder_name: folderName
        });

        showError('Failed to remove job from folder. Please try again.');

        // Re-render to show reverted state
        if (typeof displayResults === 'function' && typeof jobsCache !== 'undefined') {
            displayResults(jobsCache.slice(currentPage * 50, (currentPage + 1) * 50));
        }

        // Refresh picker to show reverted state
        if (window._originalShowFolderPicker) {
            window._originalShowFolderPicker(index);
        }
    }
}

// Helper to extract country from location string
function extractCountry(location) {
    if (!location) return null;

    // Common country codes and names
    const countries = [
        'US', 'USA', 'United States',
        'UK', 'United Kingdom',
        'CA', 'Canada',
        'AU', 'Australia',
        'DE', 'Germany',
        'FR', 'France',
        'IN', 'India',
        'SG', 'Singapore',
        'NL', 'Netherlands'
    ];

    for (const country of countries) {
        if (location.toUpperCase().includes(country.toUpperCase())) {
            // Normalize to 2-letter code
            if (country === 'United States' || country === 'USA') return 'US';
            if (country === 'United Kingdom') return 'UK';
            return country.length === 2 ? country : country.substring(0, 2).toUpperCase();
        }
    }

    return null;
}

// Helper to extract domain from company name
function extractDomain(companyName) {
    return companyName.toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .substring(0, 20) + '.com';
}

// Quick create folder with API
async function quickCreateFolderAPI(jobIndex) {
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

    // Close modal immediately for optimistic UI
    if (typeof closeModal === 'function') {
        closeModal();
    }

    try {
        // Create folder via API
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: '' })
        });

        if (!response.ok) {
            throw new Error('Failed to create folder');
        }

        const folder = await response.json();

        // Force reload folders since we created a new one
        await loadJobFolders(true);

        // Add the job to this new folder (this handles its own optimistic UI)
        await addJobToFolderAPI(jobIndex, folder.id.toString());

    } catch (error) {
        console.error('Error creating folder:', error);
        showError('Failed to create folder. Please try again.');
    }
}

// Toggle job in folder with API (add or remove)
async function toggleJobInFolderAPI(index, folderId) {
    const job = jobsCache[index];
    if (!job) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';

    if (window.isJobInFolder && window.isJobInFolder(job, companyName, folderId)) {
        // Job is already in folder - remove it
        await removeJobFromFolderAPI(index, folderId);
    } else {
        // Add to folder - this will close the modal after adding
        await addJobToFolderAPI(index, folderId);
    }
}

// Show success message
function showSuccessMessage(message) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: #28a745;
        color: white;
        padding: 15px 20px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        z-index: 9999;
        animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Wrapper for showFolderPicker that ensures folders are loaded
async function showFolderPickerWithAPI(index) {
    // Don't open picker if we're in the middle of adding a job
    if (isAddingToFolder) {
        return;
    }

    // Load folders if not yet loaded
    if (!foldersLoaded) {
        await loadJobFolders();
    }

    // Also load mappings if not yet loaded (for showing which folders job is in)
    if (!mappingsLoaded) {
        await loadJobFolderMappings();
    }

    // Show the picker using the original app.js function
    if (window._originalShowFolderPicker && typeof window._originalShowFolderPicker === 'function') {
        window._originalShowFolderPicker(index);
    } else {
        alert('Error: Folder picker not available. Please refresh the page.');
    }
}

// Safe wrapper for renderFolders - prevents crash when elements don't exist
function safeRenderFolders() {
    const foldersListElement = document.getElementById('foldersList');
    if (foldersListElement && typeof window._originalRenderFolders === 'function') {
        try {
            window._originalRenderFolders();
        } catch (error) {
            console.error('[Folder Integration] Error in renderFolders:', error);
        }
    }
}

// Safe wrapper for updateTotalJobsCount - prevents crash when elements don't exist
function safeUpdateTotalJobsCount() {
    const totalJobsCountElement = document.getElementById('totalJobsCount');
    if (totalJobsCountElement && typeof window._originalUpdateTotalJobsCount === 'function') {
        try {
            window._originalUpdateTotalJobsCount();
        } catch (error) {
            console.error('[Folder Integration] Error in updateTotalJobsCount:', error);
        }
    }
}

// Patch renderFolders to add element existence check
function patchRenderFolders() {
    if (typeof window.renderFolders !== 'function') return;

    const trueOriginal = window.renderFolders;
    window.renderFolders = function() {
        const element = document.getElementById('foldersList');
        if (!element) return;
        return trueOriginal.apply(this, arguments);
    };
}

// Patch updateTotalJobsCount to add element existence check
function patchUpdateTotalJobsCount() {
    if (typeof window.updateTotalJobsCount !== 'function') return;

    const trueOriginal = window.updateTotalJobsCount;
    window.updateTotalJobsCount = function() {
        const element = document.getElementById('totalJobsCount');
        if (!element) return;
        return trueOriginal.apply(this, arguments);
    };
}

// Override existing functions to use API
function initializeFolderIntegration() {
    // Patch renderFolders and updateTotalJobsCount with safety checks
    patchRenderFolders();
    patchUpdateTotalJobsCount();

    // Save original functions as fallbacks
    window._originalCreateNewFolder = window.createNewFolder;
    window._originalAddJobToFolder = window.addJobToFolder;
    window._originalLoadJobFolders = window.loadJobFolders;
    window._originalShowFolderPicker = window.showFolderPicker;
    window._originalQuickCreateFolder = window.quickCreateFolder;
    window._originalToggleJobInFolder = window.toggleJobInFolder;
    window._originalRenderFolders = window.renderFolders;
    window._originalUpdateTotalJobsCount = window.updateTotalJobsCount;

    // Replace with API versions
    window.createNewFolder = createNewFolderAPI;
    window.addJobToFolder = addJobToFolderAPI;
    window.showFolderPicker = showFolderPickerWithAPI;
    window.loadJobFolders = loadJobFolders; // Override to use API version
    window.quickCreateFolder = quickCreateFolderAPI; // Override quick create
    window.toggleJobInFolder = toggleJobInFolderAPI; // Override toggle
    window.renderFolders = safeRenderFolders; // Override with safe version
    window.updateTotalJobsCount = safeUpdateTotalJobsCount; // Override with safe version

    // Override getJobFolders to use the API mapping
    window._originalGetJobFolders = window.getJobFolders;
    window.getJobFolders = function(job, companyName) {
        const jobId = job.id;
        if (!jobId || !window.jobFolderMap || !window.jobFolderMap[jobId]) {
            return [];
        }
        // Return folder objects that match the expected format
        return window.jobFolderMap[jobId].map(m => ({
            id: m.folder_id,
            name: m.folder_name
        }));
    };

    // Override isJobInFolder to use the API mapping
    window._originalIsJobInFolder = window.isJobInFolder;
    window.isJobInFolder = function(job, companyName, folderId) {
        const jobId = job.id;
        if (!jobId || !window.jobFolderMap || !window.jobFolderMap[jobId]) {
            return false;
        }
        return window.jobFolderMap[jobId].some(m => m.folder_id === folderId.toString());
    };

    // Don't load folders/mappings here - they'll be loaded on first picker open
    // This avoids unnecessary API calls on page load
}

// Initialize immediately - don't wait for DOM
if (typeof window !== 'undefined') {
    const checkAndInit = () => {
        if (typeof window.loadJobFolders === 'function') {
            initializeFolderIntegration();
        } else {
            setTimeout(checkAndInit, 1);
        }
    };
    checkAndInit();
}

// Add animation for notification
if (!document.getElementById('folder-integration-styles')) {
    const style = document.createElement('style');
    style.id = 'folder-integration-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    `;
    document.head.appendChild(style);
}

// Folder integration loaded
