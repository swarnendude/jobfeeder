// Folder Integration for App.js - PostgreSQL Backend
// This file extends the existing app.js to integrate with the PostgreSQL folders API

// Load folders from API instead of localStorage
async function loadJobFolders() {
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
            jobs: Array(f.job_count || 0).fill(null), // Create array with length = job_count for compatibility
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

        console.log(`Loaded ${jobFolders.length} folders from API`);
    } catch (error) {
        console.error('Error loading folders from API:', error);
        // Fallback to localStorage
        loadJobFoldersLocal();
    }
}

// Original localStorage implementation as fallback
function loadJobFoldersLocal() {
    const JOB_FOLDERS_KEY = 'jobfeeder_job_folders'; // Define locally to avoid conflicts
    const stored = localStorage.getItem(JOB_FOLDERS_KEY);
    if (stored) {
        try {
            jobFolders = JSON.parse(stored);
        } catch (e) {
            console.error('Failed to parse stored folders:', e);
            jobFolders = [];
        }
    }
    renderFolders();
    updateTotalJobsCount();
}

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

        // Reload folders
        await loadJobFolders();

        // Show success message
        showSuccessMessage('Folder created successfully!');
    } catch (error) {
        console.error('Error creating folder:', error);
        showError('Failed to create folder via API. Using local storage as fallback.');
        // Fallback to local implementation
        createNewFolder();
    }
}

// Add job to folder using API
async function addJobToFolderAPI(index, folderId) {
    const job = jobsCache[index];
    if (!job) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';
    const companyDomain = company.domain || job.company_domain || extractDomain(companyName);

    try {
        const response = await fetch(`/api/folders/${folderId}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: job.id,
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

        const result = await response.json();

        // Show success message
        showSuccessMessage('Job added to folder! Company enrichment started in background.');

        // Reload folders to reflect changes
        await loadJobFolders();

        // Re-render current results to update folder indicators
        if (typeof displayResults === 'function' && typeof jobsCache !== 'undefined') {
            displayResults(jobsCache.slice(currentPage * 50, (currentPage + 1) * 50));
        }

        // Close modal
        if (typeof closeModal === 'function') {
            closeModal();
        }
    } catch (error) {
        console.error('Error adding job to folder:', error);
        showError('Failed to add job via API. Using local storage as fallback.');
        // Fallback to local implementation - use original function
        if (typeof window._originalAddJobToFolder === 'function') {
            window._originalAddJobToFolder(index, folderId);
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

        // Reload folders to get the new folder
        await loadJobFolders();

        // Add the job to this new folder
        await addJobToFolderAPI(jobIndex, folder.id.toString());

    } catch (error) {
        console.error('Error creating folder:', error);
        showError('Failed to create folder via API. Using local storage as fallback.');
        // Fallback to local implementation
        if (window._originalQuickCreateFolder) {
            window._originalQuickCreateFolder(jobIndex);
        }
    }
}

// Toggle job in folder with API
async function toggleJobInFolderAPI(index, folderId) {
    const job = jobsCache[index];
    if (!job) return;

    const company = job.company_object || {};
    const companyName = company.name || job.company || 'Unknown Company';

    // For now, we only support adding (not removing) via API
    // Removal would require DELETE endpoint
    if (window.isJobInFolder && window.isJobInFolder(job, companyName, folderId)) {
        // Job is already in folder - would need to remove
        alert('Removing jobs from folders is not yet supported via API. Please use the folders page.');
        return;
    }

    // Add to folder
    await addJobToFolderAPI(index, folderId);

    // Refresh the picker to show updated state
    if (window._originalShowFolderPicker) {
        await loadJobFolders();
        window._originalShowFolderPicker(index);
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
    console.log('[Folder Integration] Opening folder picker for job index:', index);
    console.log('[Folder Integration] Current jobFolders before reload:', jobFolders);

    // Reload folders from API first to ensure fresh data
    console.log('[Folder Integration] Loading folders from API...');
    await loadJobFolders();

    console.log('[Folder Integration] After reload - jobFolders:', jobFolders);
    console.log('[Folder Integration] Folders loaded:', jobFolders?.length || 0);
    console.log('[Folder Integration] Folder names:', jobFolders?.map(f => f.name) || []);
    console.log('[Folder Integration] First folder details:', jobFolders?.[0]);

    // Verify the global jobFolders variable is set
    console.log('[Folder Integration] window.jobFolders:', window.jobFolders);
    console.log('[Folder Integration] typeof jobFolders:', typeof jobFolders);

    // Then show the picker (uses the original app.js function)
    if (window._originalShowFolderPicker && typeof window._originalShowFolderPicker === 'function') {
        console.log('[Folder Integration] Calling original showFolderPicker');
        console.log('[Folder Integration] jobFolders just before calling:', jobFolders);
        console.log('[Folder Integration] jobFolders.length:', jobFolders.length);
        console.log('[Folder Integration] Array.isArray(jobFolders):', Array.isArray(jobFolders));

        window._originalShowFolderPicker(index);

        console.log('[Folder Integration] Original showFolderPicker called');
        console.log('[Folder Integration] Modal should now be visible');
    } else {
        console.error('[Folder Integration] ERROR: Original showFolderPicker not available!');
        console.log('[Folder Integration] Available:', window._originalShowFolderPicker);
        alert('Error: Folder picker not available. Please refresh the page.');
    }
}

// Safe wrapper for renderFolders - prevents crash when elements don't exist
function safeRenderFolders() {
    console.log('[Folder Integration] safeRenderFolders called');
    const foldersListElement = document.getElementById('foldersList');
    console.log('[Folder Integration] foldersList element exists:', !!foldersListElement);

    // Only call if element exists
    if (foldersListElement && typeof window._originalRenderFolders === 'function') {
        console.log('[Folder Integration] Calling original renderFolders');
        try {
            window._originalRenderFolders();
        } catch (error) {
            console.error('[Folder Integration] Error in renderFolders:', error);
        }
    } else {
        console.log('[Folder Integration] Skipping renderFolders - element not found');
    }
}

// Safe wrapper for updateTotalJobsCount - prevents crash when elements don't exist
function safeUpdateTotalJobsCount() {
    const totalJobsCountElement = document.getElementById('totalJobsCount');

    // Only call if element exists
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

    // Save the REAL original before any modifications
    const trueOriginal = window.renderFolders;

    // Create a patched version that adds safety check
    window.renderFolders = function() {
        const element = document.getElementById('foldersList');
        if (!element) {
            console.log('[Folder Integration] renderFolders called but foldersList element not found - skipping');
            return;
        }
        // Call the true original function
        return trueOriginal.apply(this, arguments);
    };

    console.log('[Folder Integration] renderFolders patched with safety check');
}

// Patch updateTotalJobsCount to add element existence check
function patchUpdateTotalJobsCount() {
    if (typeof window.updateTotalJobsCount !== 'function') return;

    const trueOriginal = window.updateTotalJobsCount;

    window.updateTotalJobsCount = function() {
        const element = document.getElementById('totalJobsCount');
        if (!element) {
            console.log('[Folder Integration] updateTotalJobsCount called but totalJobsCount element not found - skipping');
            return;
        }
        return trueOriginal.apply(this, arguments);
    };

    console.log('[Folder Integration] updateTotalJobsCount patched with safety check');
}

// Override existing functions to use API
// Wait for DOM to be ready to ensure app.js functions are defined
function initializeFolderIntegration() {
    console.log('[Folder Integration] Initializing...');

    // FIRST: Patch renderFolders and updateTotalJobsCount with safety checks
    // This must happen BEFORE we save them as "_original" versions
    patchRenderFolders();
    patchUpdateTotalJobsCount();

    // Save original functions as fallbacks (these are now the patched versions)
    window._originalCreateNewFolder = window.createNewFolder;
    window._originalAddJobToFolder = window.addJobToFolder;
    window._originalLoadJobFolders = window.loadJobFolders;
    window._originalShowFolderPicker = window.showFolderPicker;
    window._originalQuickCreateFolder = window.quickCreateFolder;
    window._originalToggleJobInFolder = window.toggleJobInFolder;
    window._originalRenderFolders = window.renderFolders; // Already patched
    window._originalUpdateTotalJobsCount = window.updateTotalJobsCount; // Already patched

    console.log('[Folder Integration] Original functions saved:', {
        createNewFolder: !!window._originalCreateNewFolder,
        addJobToFolder: !!window._originalAddJobToFolder,
        loadJobFolders: !!window._originalLoadJobFolders,
        showFolderPicker: !!window._originalShowFolderPicker,
        quickCreateFolder: !!window._originalQuickCreateFolder,
        toggleJobInFolder: !!window._originalToggleJobInFolder,
        renderFolders: !!window._originalRenderFolders,
        updateTotalJobsCount: !!window._originalUpdateTotalJobsCount
    });

    // Replace with API versions
    window.createNewFolder = createNewFolderAPI;
    window.addJobToFolder = addJobToFolderAPI;
    window.showFolderPicker = showFolderPickerWithAPI;
    window.loadJobFolders = loadJobFolders; // Override to use API version
    window.quickCreateFolder = quickCreateFolderAPI; // Override quick create
    window.toggleJobInFolder = toggleJobInFolderAPI; // Override toggle
    window.renderFolders = safeRenderFolders; // Override with safe version
    window.updateTotalJobsCount = safeUpdateTotalJobsCount; // Override with safe version

    // Load folders from API immediately
    loadJobFolders();

    console.log('[Folder Integration] API integration active');
}

// Initialize immediately - don't wait for DOM
// CRITICAL: We need to override functions BEFORE app.js DOMContentLoaded fires
if (typeof window !== 'undefined') {
    // Poll for functions to be defined and override them immediately
    const checkAndInit = () => {
        // Check if critical functions are defined
        if (typeof window.loadJobFolders === 'function') {
            console.log('[Folder Integration] App.js functions detected, initializing...');
            initializeFolderIntegration();
        } else {
            // App.js hasn't defined functions yet, check again VERY soon (1ms)
            setTimeout(checkAndInit, 1);
        }
    };

    // Start checking immediately when this script loads
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

console.log('Folder integration loaded - using PostgreSQL API');
