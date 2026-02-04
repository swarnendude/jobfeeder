// Folders Management - Frontend
let folders = [];
let currentFolder = null;
let notifications = [];

// DOM Elements
const elements = {
    foldersGrid: document.getElementById('foldersGrid'),
    folderName: document.getElementById('folderName'),
    folderDescription: document.getElementById('folderDescription'),
    createFolderBtn: document.getElementById('createFolderBtn'),
    folderModal: document.getElementById('folderModal'),
    closeModal: document.getElementById('closeModal'),
    modalFolderTitle: document.getElementById('modalFolderTitle'),
    modalFolderStatus: document.getElementById('modalFolderStatus'),
    modalContent: document.getElementById('modalContent'),
    notificationBell: document.getElementById('notificationBell'),
    notificationBadge: document.getElementById('notificationBadge'),
    notificationDropdown: document.getElementById('notificationDropdown'),
    notificationsList: document.getElementById('notificationsList'),
    markAllRead: document.getElementById('markAllRead')
};

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await loadFolders();
    await loadNotifications();
    setupEventListeners();

    // Poll for updates every 10 seconds
    setInterval(async () => {
        await loadNotifications();
    }, 10000);
});

function setupEventListeners() {
    elements.createFolderBtn.addEventListener('click', createFolder);
    elements.folderName.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') createFolder();
    });
    elements.closeModal.addEventListener('click', closeModal);
    elements.folderModal.addEventListener('click', (e) => {
        if (e.target === elements.folderModal) closeModal();
    });
    elements.notificationBell.addEventListener('click', toggleNotifications);
    elements.markAllRead.addEventListener('click', markAllNotificationsRead);

    // Close notifications when clicking outside
    document.addEventListener('click', (e) => {
        if (!elements.notificationBell.contains(e.target)) {
            elements.notificationDropdown.classList.remove('active');
        }
    });
}

// ===== FOLDERS =====

async function loadFolders() {
    try {
        const response = await fetch('/api/folders');
        if (!response.ok) throw new Error('Failed to load folders');

        folders = await response.json();
        renderFolders();
    } catch (error) {
        console.error('Error loading folders:', error);
        elements.foldersGrid.innerHTML = `
            <div class="empty-state">
                <h3>Error loading folders</h3>
                <p>${error.message}</p>
            </div>
        `;
    }
}

function renderFolders() {
    if (folders.length === 0) {
        elements.foldersGrid.innerHTML = `
            <div class="empty-state">
                <h3>No folders yet</h3>
                <p>Create a folder to start organizing your job prospects</p>
            </div>
        `;
        return;
    }

    elements.foldersGrid.innerHTML = folders.map(folder => `
        <div class="folder-card" onclick="openFolder(${folder.id})">
            <div class="folder-header">
                <div class="folder-title">${escapeHtml(folder.name)}</div>
                <div class="folder-status ${folder.status}">${formatStatus(folder.status)}</div>
            </div>
            ${folder.description ? `<p style="color: #6c757d; font-size: 14px; margin-bottom: 10px;">${escapeHtml(folder.description)}</p>` : ''}
            <div class="folder-stats">
                <div class="folder-stat"><strong>${folder.job_count || 0}</strong> jobs</div>
                <div class="folder-stat"><strong>${folder.prospect_count || 0}</strong> prospects</div>
                <div class="folder-stat"><strong>${folder.selected_prospect_count || 0}</strong> selected</div>
            </div>
            <div class="folder-actions" onclick="event.stopPropagation()">
                ${getActionButtons(folder)}
            </div>
        </div>
    `).join('');
}

function getActionButtons(folder) {
    const buttons = [];

    // Always show "View Details"
    buttons.push(`<button class="btn btn-sm btn-primary" onclick="openFolder(${folder.id})">View Details</button>`);

    // Show "Collect Prospects" if company enrichment is done
    if (folder.status === 'company_enriched') {
        buttons.push(`<button class="btn btn-sm btn-success" onclick="collectProspects(${folder.id})">Collect Prospects</button>`);
    }

    // Show "Auto-Select" if prospects are collected
    if (folder.status === 'prospects_collected') {
        buttons.push(`<button class="btn btn-sm btn-info" onclick="autoSelectProspects(${folder.id})">Auto-Select Top Prospects</button>`);
    }

    // Show "Enrich Contacts" if prospects are selected
    if (folder.status === 'prospects_selected') {
        buttons.push(`<button class="btn btn-sm btn-warning" onclick="enrichContacts(${folder.id})">Get Email Addresses</button>`);
    }

    // Show "Delete" button
    buttons.push(`<button class="btn btn-sm btn-danger" onclick="deleteFolder(${folder.id})">Delete</button>`);

    return buttons.join('');
}

function formatStatus(status) {
    return status.replace(/_/g, ' ');
}

async function createFolder() {
    const name = elements.folderName.value.trim();
    if (!name) {
        alert('Please enter a folder name');
        return;
    }

    const description = elements.folderDescription.value.trim();

    try {
        const response = await fetch('/api/folders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description })
        });

        if (!response.ok) throw new Error('Failed to create folder');

        elements.folderName.value = '';
        elements.folderDescription.value = '';
        await loadFolders();
        showNotification('Folder created successfully!', 'success');
    } catch (error) {
        console.error('Error creating folder:', error);
        alert('Failed to create folder: ' + error.message);
    }
}

async function openFolder(folderId) {
    try {
        const response = await fetch(`/api/folders/${folderId}`);
        if (!response.ok) throw new Error('Failed to load folder details');

        const data = await response.json();
        currentFolder = data;

        elements.modalFolderTitle.textContent = data.folder.name;
        elements.modalFolderStatus.innerHTML = `<span class="folder-status ${data.folder.status}">${formatStatus(data.folder.status)}</span>`;

        renderFolderDetails(data);
        elements.folderModal.classList.add('active');
    } catch (error) {
        console.error('Error opening folder:', error);
        alert('Failed to open folder: ' + error.message);
    }
}

function renderFolderDetails(data) {
    const { folder, jobs, prospects, tasks } = data;

    let html = '';

    // Jobs section
    html += '<div style="margin-bottom: 30px;">';
    html += '<h3>Jobs in this Folder</h3>';
    if (jobs.length === 0) {
        html += '<p style="color: #6c757d;">No jobs added yet. Add jobs from the search page.</p>';
    } else {
        html += '<div style="display: grid; gap: 10px;">';
        jobs.forEach(job => {
            html += `
                <div style="border: 1px solid #ddd; padding: 15px; border-radius: 8px;">
                    <div style="display: flex; justify-content: space-between;">
                        <div>
                            <strong>${escapeHtml(job.job_title)}</strong> at ${escapeHtml(job.company_name)}
                            <div style="color: #6c757d; font-size: 14px; margin-top: 5px;">
                                ${job.location || 'Location not specified'} • ${job.company_domain}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += '</div>';
    }
    html += '</div>';

    // Prospects section
    if (prospects.length > 0) {
        html += '<div style="margin-bottom: 30px;">';
        html += '<h3>Prospects (Grouped by Company)</h3>';
        html += renderProspectsTable(prospects);
        html += '</div>';
    }

    // Action buttons
    html += '<div class="btn-group">';

    if (folder.status === 'company_enriched') {
        html += `<button class="btn btn-success" onclick="collectProspects(${folder.id})">🔍 Collect Prospects</button>`;
    }

    if (folder.status === 'prospects_collected' && prospects.length > 0) {
        html += `<button class="btn btn-info" onclick="autoSelectProspects(${folder.id})">✨ Auto-Select Top 2-3 per Company</button>`;
    }

    if (folder.status === 'prospects_selected') {
        const selectedCount = prospects.filter(p => p.selected).length;
        html += `<button class="btn btn-warning" onclick="enrichContacts(${folder.id})">📧 Get Email Addresses (${selectedCount} prospects)</button>`;
    }

    if (folder.status === 'ready_for_outreach') {
        const enrichedCount = prospects.filter(p => p.email).length;
        html += `<button class="btn btn-primary" onclick="exportProspects(${folder.id})">📤 Export Prospects (${enrichedCount} with emails)</button>`;
    }

    html += '</div>';

    // Background tasks
    if (tasks.length > 0) {
        html += '<div style="margin-top: 30px;">';
        html += '<h3>Background Tasks</h3>';
        html += '<div style="display: grid; gap: 10px;">';
        tasks.slice(0, 5).forEach(task => {
            html += `
                <div style="border: 1px solid #ddd; padding: 10px; border-radius: 8px; font-size: 14px;">
                    <strong>${formatTaskType(task.task_type)}</strong>
                    <span style="float: right; color: ${getTaskStatusColor(task.status)};">${task.status}</span>
                    ${task.progress && task.total ? `<div style="margin-top: 5px;">Progress: ${task.progress}/${task.total}</div>` : ''}
                </div>
            `;
        });
        html += '</div>';
        html += '</div>';
    }

    elements.modalContent.innerHTML = html;
}

function renderProspectsTable(prospects) {
    // Group by company
    const byCompany = {};
    prospects.forEach(p => {
        if (!byCompany[p.company_name]) {
            byCompany[p.company_name] = [];
        }
        byCompany[p.company_name].push(p);
    });

    let html = '<table class="prospects-table">';
    html += '<thead><tr><th>Select</th><th>Name</th><th>Title</th><th>Priority</th><th>AI Score</th><th>Contact</th></tr></thead>';
    html += '<tbody>';

    for (const [companyName, companyProspects] of Object.entries(byCompany)) {
        html += `<tr class="company-group-header"><td colspan="6">${escapeHtml(companyName)} (${companyProspects.length} prospects)</td></tr>`;

        companyProspects.forEach(p => {
            html += '<tr>';
            html += `<td><input type="checkbox" class="prospect-checkbox" data-id="${p.id}" ${p.selected ? 'checked' : ''} onchange="toggleProspect(${p.id}, this.checked)"></td>`;
            html += `<td>${escapeHtml(p.name)}</td>`;
            html += `<td>${escapeHtml(p.title || 'N/A')}</td>`;
            html += `<td><span class="priority-badge priority-${p.priority || 'low'}">${p.priority || 'low'}</span></td>`;
            html += `<td>${p.ai_score ? `<span class="ai-score">${(p.ai_score * 100).toFixed(0)}%</span>` : 'N/A'}</td>`;
            html += `<td>${p.email || (p.signalhire_enriched ? 'Not found' : 'Not enriched')}</td>`;
            html += '</tr>';
        });
    }

    html += '</tbody></table>';
    return html;
}

async function collectProspects(folderId) {
    if (!confirm('Start collecting prospects for this folder? This may take a few minutes.')) {
        return;
    }

    try {
        const response = await fetch(`/api/folders/${folderId}/collect-prospects`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to start prospect collection');

        showNotification('Prospect collection started in background', 'info');
        closeModal();
        await loadFolders();
    } catch (error) {
        console.error('Error collecting prospects:', error);
        alert('Failed to start prospect collection: ' + error.message);
    }
}

async function autoSelectProspects(folderId) {
    if (!confirm('Automatically select the top 2-3 prospects from each company based on AI scoring?')) {
        return;
    }

    try {
        const response = await fetch(`/api/folders/${folderId}/auto-select`, {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to auto-select prospects');

        showNotification('Prospects auto-selected successfully!', 'success');
        await openFolder(folderId); // Refresh modal
    } catch (error) {
        console.error('Error auto-selecting prospects:', error);
        alert('Failed to auto-select prospects: ' + error.message);
    }
}

async function toggleProspect(prospectId, selected) {
    try {
        const response = await fetch(`/api/prospects/${prospectId}/select`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ selected })
        });

        if (!response.ok) throw new Error('Failed to update prospect selection');
    } catch (error) {
        console.error('Error toggling prospect:', error);
        alert('Failed to update prospect: ' + error.message);
    }
}

async function enrichContacts(folderId) {
    if (!confirm('Collect email addresses for selected prospects? This will use your daily SignalHire credit limit (150 emails/day).')) {
        return;
    }

    try {
        const response = await fetch(`/api/folders/${folderId}/enrich-contacts`, {
            method: 'POST'
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to start contact enrichment');
        }

        showNotification('Contact enrichment started in background', 'info');
        closeModal();
        await loadFolders();
    } catch (error) {
        console.error('Error enriching contacts:', error);
        alert('Failed to start contact enrichment: ' + error.message);
    }
}

async function exportProspects(folderId) {
    try {
        const response = await fetch(`/api/folders/${folderId}`);
        if (!response.ok) throw new Error('Failed to load folder');

        const data = await response.json();
        const prospects = data.prospects.filter(p => p.selected);

        // Create CSV
        const csv = generateCSV(prospects);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);

        // Download
        const a = document.createElement('a');
        a.href = url;
        a.download = `prospects-${data.folder.name.replace(/[^a-z0-9]/gi, '-')}.csv`;
        a.click();

        showNotification('Prospects exported successfully!', 'success');
    } catch (error) {
        console.error('Error exporting prospects:', error);
        alert('Failed to export prospects: ' + error.message);
    }
}

function generateCSV(prospects) {
    const headers = ['Name', 'Title', 'Company', 'Email', 'Phone', 'LinkedIn', 'Priority', 'AI Score'];
    const rows = prospects.map(p => [
        p.name,
        p.title || '',
        p.company_name,
        p.email || '',
        p.phone || '',
        p.linkedin_url || '',
        p.priority || '',
        p.ai_score ? (p.ai_score * 100).toFixed(0) + '%' : ''
    ]);

    return [headers, ...rows]
        .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
        .join('\n');
}

async function deleteFolder(folderId) {
    if (!confirm('Are you sure you want to delete this folder? This will delete all jobs and prospects in it.')) {
        return;
    }

    try {
        const response = await fetch(`/api/folders/${folderId}`, {
            method: 'DELETE'
        });

        if (!response.ok) throw new Error('Failed to delete folder');

        showNotification('Folder deleted successfully', 'success');
        closeModal();
        await loadFolders();
    } catch (error) {
        console.error('Error deleting folder:', error);
        alert('Failed to delete folder: ' + error.message);
    }
}

function closeModal() {
    elements.folderModal.classList.remove('active');
    currentFolder = null;
}

// ===== NOTIFICATIONS =====

async function loadNotifications() {
    try {
        const response = await fetch('/api/notifications/unread');
        if (!response.ok) return;

        notifications = await response.json();
        updateNotificationBadge();
        renderNotifications();
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

function updateNotificationBadge() {
    const unreadCount = notifications.length;
    if (unreadCount > 0) {
        elements.notificationBadge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        elements.notificationBadge.style.display = 'flex';
    } else {
        elements.notificationBadge.style.display = 'none';
    }
}

function renderNotifications() {
    if (notifications.length === 0) {
        elements.notificationsList.innerHTML = '<div style="padding: 20px; text-align: center; color: #6c757d;">No new notifications</div>';
        return;
    }

    elements.notificationsList.innerHTML = notifications.map(n => `
        <div class="notification-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick(${n.id}, '${n.link || ''}')">
            <div style="font-weight: 600; margin-bottom: 5px;">${escapeHtml(n.title)}</div>
            <div style="font-size: 13px; color: #6c757d;">${escapeHtml(n.message)}</div>
            <div style="font-size: 11px; color: #999; margin-top: 5px;">${formatTimestamp(n.created_at)}</div>
        </div>
    `).join('');
}

function toggleNotifications() {
    elements.notificationDropdown.classList.toggle('active');
}

async function handleNotificationClick(notificationId, link) {
    try {
        await fetch(`/api/notifications/${notificationId}/read`, {
            method: 'PATCH'
        });

        await loadNotifications();

        if (link) {
            // Handle navigation (e.g., /folders/123)
            const folderMatch = link.match(/\/folders\/(\d+)/);
            if (folderMatch) {
                openFolder(parseInt(folderMatch[1]));
            }
        }
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

async function markAllNotificationsRead() {
    try {
        const response = await fetch('/api/notifications/read-all', {
            method: 'POST'
        });

        if (!response.ok) throw new Error('Failed to mark all as read');

        await loadNotifications();
    } catch (error) {
        console.error('Error marking all as read:', error);
    }
}

// ===== HELPERS =====

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTaskType(type) {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function getTaskStatusColor(status) {
    const colors = {
        pending: '#ffc107',
        processing: '#17a2b8',
        completed: '#28a745',
        failed: '#dc3545'
    };
    return colors[status] || '#6c757d';
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000); // seconds

    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
    return `${Math.floor(diff / 86400)} days ago`;
}

function showNotification(message, type = 'info') {
    // Simple notification toast (you can enhance this)
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${type === 'success' ? '#28a745' : type === 'error' ? '#dc3545' : '#17a2b8'};
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

// Add animation for notification toast
const style = document.createElement('style');
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
