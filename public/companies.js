// Companies Page JavaScript

let allCompanies = [];
let filteredCompanies = [];

// DOM Elements
const elements = {
    companiesList: document.getElementById('companiesList'),
    searchCompanies: document.getElementById('searchCompanies'),
    filterStatus: document.getElementById('filterStatus'),
    statTotal: document.getElementById('statTotal'),
    statCompleted: document.getElementById('statCompleted'),
    statProcessing: document.getElementById('statProcessing'),
    statFailed: document.getElementById('statFailed'),
    companyModal: document.getElementById('companyModal'),
    companyModalBody: document.getElementById('companyModalBody')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadCompanies();

    // Event listeners
    elements.searchCompanies.addEventListener('input', filterCompanies);
    elements.filterStatus.addEventListener('change', filterCompanies);

    // Close modal on click outside
    elements.companyModal.addEventListener('click', (e) => {
        if (e.target === elements.companyModal) {
            closeCompanyModal();
        }
    });

    // Close modal on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeCompanyModal();
        }
    });
});

async function loadCompanies() {
    try {
        const response = await fetch('/api/companies');
        if (!response.ok) {
            throw new Error('Failed to load companies');
        }

        const data = await response.json();
        allCompanies = data.companies || [];

        // Update stats
        updateStats(data.stats);

        // Initial render
        filterCompanies();

    } catch (error) {
        console.error('Error loading companies:', error);
        elements.companiesList.innerHTML = `
            <div class="error-state">
                <p>Failed to load companies. Make sure the server is running.</p>
                <button onclick="loadCompanies()" class="btn-retry">Retry</button>
            </div>
        `;
    }
}

function updateStats(stats) {
    if (!stats) return;
    elements.statTotal.textContent = stats.total || 0;
    elements.statCompleted.textContent = stats.completed || 0;
    elements.statProcessing.textContent = (stats.processing || 0) + (stats.pending || 0);
    elements.statFailed.textContent = stats.failed || 0;
}

function filterCompanies() {
    const searchTerm = elements.searchCompanies.value.toLowerCase();
    const statusFilter = elements.filterStatus.value;

    filteredCompanies = allCompanies.filter(company => {
        // Search filter
        const matchesSearch = !searchTerm ||
            company.name?.toLowerCase().includes(searchTerm) ||
            company.domain?.toLowerCase().includes(searchTerm);

        // Status filter
        const matchesStatus = statusFilter === 'all' ||
            company.enrichment_status === statusFilter;

        return matchesSearch && matchesStatus;
    });

    renderCompanies();
}

function renderCompanies() {
    if (filteredCompanies.length === 0) {
        elements.companiesList.innerHTML = `
            <div class="empty-state">
                <h3>No companies found</h3>
                <p>Companies are added automatically when you save jobs to folders.</p>
            </div>
        `;
        return;
    }

    elements.companiesList.innerHTML = filteredCompanies.map(company => createCompanyCard(company)).join('');
}

function createCompanyCard(company) {
    const theirstack = company.theirstack_data || {};
    const enriched = company.enriched_data || {};

    const statusClass = getStatusClass(company.enrichment_status);
    const statusLabel = getStatusLabel(company.enrichment_status);

    // Company logo
    const logoHtml = theirstack.logo
        ? `<img src="${escapeHtml(theirstack.logo)}" alt="${escapeHtml(company.name)}" class="company-card-logo" onerror="this.outerHTML='<div class=\\'company-card-logo-placeholder\\'>${company.name?.charAt(0) || 'C'}</div>'">`
        : `<div class="company-card-logo-placeholder">${company.name?.charAt(0) || 'C'}</div>`;

    // Quick info
    let quickInfo = [];
    if (theirstack.industry) quickInfo.push(theirstack.industry);
    if (theirstack.employee_count) quickInfo.push(formatEmployeeCount(theirstack.employee_count) + ' employees');
    if (theirstack.funding_stage) quickInfo.push(formatFundingStage(theirstack.funding_stage));

    // Summary (from enriched data or fallback)
    const summary = enriched.company_summary || enriched.tagline ||
        (theirstack.industry ? `${theirstack.industry} company` : 'No description available');

    return `
        <div class="company-card" onclick="showCompanyDetails('${escapeHtml(company.domain)}')">
            <div class="company-card-header">
                ${logoHtml}
                <div class="company-card-info">
                    <h3 class="company-card-name">${escapeHtml(company.name)}</h3>
                    <a href="https://${escapeHtml(company.domain)}" target="_blank" class="company-card-domain" onclick="event.stopPropagation()">
                        ${escapeHtml(company.domain)}
                    </a>
                </div>
                <span class="company-status ${statusClass}">${statusLabel}</span>
            </div>
            <p class="company-card-summary">${escapeHtml(summary.substring(0, 150))}${summary.length > 150 ? '...' : ''}</p>
            ${quickInfo.length > 0 ? `
                <div class="company-card-tags">
                    ${quickInfo.map(info => `<span class="company-card-tag">${escapeHtml(info)}</span>`).join('')}
                </div>
            ` : ''}
            ${enriched.tech_stack && enriched.tech_stack.length > 0 ? `
                <div class="company-card-tech">
                    ${enriched.tech_stack.slice(0, 5).map(tech => `<span class="tech-tag-small">${escapeHtml(tech)}</span>`).join('')}
                    ${enriched.tech_stack.length > 5 ? `<span class="tech-tag-more">+${enriched.tech_stack.length - 5}</span>` : ''}
                </div>
            ` : ''}
        </div>
    `;
}

async function showCompanyDetails(domain) {
    const company = allCompanies.find(c => c.domain === domain);
    if (!company) return;

    const theirstack = company.theirstack_data || {};
    const enriched = company.enriched_data || {};

    // Build modal content
    let html = `
        <div class="company-detail">
            <div class="company-detail-header">
                ${theirstack.logo
                    ? `<img src="${escapeHtml(theirstack.logo)}" alt="${escapeHtml(company.name)}" class="company-detail-logo">`
                    : `<div class="company-detail-logo-placeholder">${company.name?.charAt(0) || 'C'}</div>`
                }
                <div class="company-detail-info">
                    <h2>${escapeHtml(company.name)}</h2>
                    <a href="https://${escapeHtml(company.domain)}" target="_blank" class="company-detail-link">
                        ${escapeHtml(company.domain)} &#8599;
                    </a>
                    <span class="company-status ${getStatusClass(company.enrichment_status)}">${getStatusLabel(company.enrichment_status)}</span>
                </div>
            </div>
    `;

    // Quick Stats
    html += '<div class="company-detail-stats">';
    if (theirstack.employee_count) {
        html += `<div class="detail-stat"><span class="detail-stat-value">${formatEmployeeCount(theirstack.employee_count)}</span><span class="detail-stat-label">Employees</span></div>`;
    }
    if (theirstack.founded_year) {
        html += `<div class="detail-stat"><span class="detail-stat-value">${theirstack.founded_year}</span><span class="detail-stat-label">Founded</span></div>`;
    }
    if (theirstack.funding_stage) {
        html += `<div class="detail-stat"><span class="detail-stat-value">${formatFundingStage(theirstack.funding_stage)}</span><span class="detail-stat-label">Funding</span></div>`;
    }
    if (theirstack.total_funding_usd) {
        html += `<div class="detail-stat"><span class="detail-stat-value">$${formatNumber(theirstack.total_funding_usd)}</span><span class="detail-stat-label">Total Raised</span></div>`;
    }
    if (theirstack.country) {
        html += `<div class="detail-stat"><span class="detail-stat-value">${escapeHtml(theirstack.country)}</span><span class="detail-stat-label">Location</span></div>`;
    }
    if (theirstack.industry) {
        html += `<div class="detail-stat"><span class="detail-stat-value">${escapeHtml(theirstack.industry)}</span><span class="detail-stat-label">Industry</span></div>`;
    }
    html += '</div>';

    // Enriched Data Section
    if (company.enrichment_status === 'completed' && enriched) {
        html += '<div class="company-enriched-data">';

        // Company Summary
        if (enriched.company_summary) {
            html += `
                <div class="enriched-section">
                    <h4>About</h4>
                    <p>${escapeHtml(enriched.company_summary)}</p>
                </div>
            `;
        }

        // Description
        if (enriched.description) {
            html += `
                <div class="enriched-section">
                    <h4>Description</h4>
                    <p>${escapeHtml(enriched.description)}</p>
                </div>
            `;
        }

        // Work Culture
        if (enriched.work_culture_assessment) {
            html += `
                <div class="enriched-section">
                    <h4>Work Culture</h4>
                    <p>${escapeHtml(enriched.work_culture_assessment)}</p>
                </div>
            `;
        }

        // Culture Values
        if (enriched.culture_values && enriched.culture_values.length > 0) {
            html += `
                <div class="enriched-section">
                    <h4>Values</h4>
                    <div class="enriched-tags">
                        ${enriched.culture_values.map(v => `<span class="enriched-tag">${escapeHtml(v)}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // Benefits
        if (enriched.benefits && enriched.benefits.length > 0) {
            html += `
                <div class="enriched-section">
                    <h4>Benefits</h4>
                    <div class="enriched-tags benefits">
                        ${enriched.benefits.map(b => `<span class="enriched-tag benefit">${escapeHtml(b)}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // Remote Policy
        if (enriched.remote_policy) {
            html += `
                <div class="enriched-section">
                    <h4>Remote Policy</h4>
                    <p>${escapeHtml(enriched.remote_policy)}</p>
                </div>
            `;
        }

        // Products
        if (enriched.products && enriched.products.length > 0) {
            html += `
                <div class="enriched-section">
                    <h4>Products & Services</h4>
                    <ul class="enriched-list">
                        ${enriched.products.map(p => `<li>${escapeHtml(p)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Tech Stack
        if (enriched.tech_stack && enriched.tech_stack.length > 0) {
            html += `
                <div class="enriched-section">
                    <h4>Tech Stack</h4>
                    <div class="enriched-tags tech">
                        ${enriched.tech_stack.map(t => `<span class="enriched-tag tech">${escapeHtml(t)}</span>`).join('')}
                    </div>
                </div>
            `;
        }

        // Growth Signals
        if (enriched.growth_signals && enriched.growth_signals.length > 0) {
            html += `
                <div class="enriched-section positive">
                    <h4>Growth Signals</h4>
                    <ul class="enriched-list">
                        ${enriched.growth_signals.map(s => `<li>${escapeHtml(s)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Red Flags
        if (enriched.red_flags && enriched.red_flags.length > 0) {
            html += `
                <div class="enriched-section warning">
                    <h4>Things to Consider</h4>
                    <ul class="enriched-list">
                        ${enriched.red_flags.map(f => `<li>${escapeHtml(f)}</li>`).join('')}
                    </ul>
                </div>
            `;
        }

        // Leadership
        if (enriched.founders && enriched.founders.length > 0) {
            html += `
                <div class="enriched-section">
                    <h4>Founders</h4>
                    <div class="leadership-list">
                        ${enriched.founders.map(f => `
                            <div class="leader-item">
                                <span class="leader-name">${escapeHtml(f.name)}</span>
                                ${f.title ? `<span class="leader-title">${escapeHtml(f.title)}</span>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Social Links
        if (enriched.social_links) {
            const links = [];
            if (enriched.social_links.linkedin) links.push(`<a href="${escapeHtml(enriched.social_links.linkedin)}" target="_blank">LinkedIn</a>`);
            if (enriched.social_links.twitter) links.push(`<a href="${escapeHtml(enriched.social_links.twitter)}" target="_blank">Twitter</a>`);
            if (enriched.social_links.facebook) links.push(`<a href="${escapeHtml(enriched.social_links.facebook)}" target="_blank">Facebook</a>`);
            if (theirstack.linkedin_url) links.push(`<a href="${escapeHtml(theirstack.linkedin_url)}" target="_blank">LinkedIn</a>`);

            if (links.length > 0) {
                html += `
                    <div class="enriched-section">
                        <h4>Social</h4>
                        <div class="social-links">${links.join(' ')}</div>
                    </div>
                `;
            }
        }

        // GTM Opportunity Assessment
        if (enriched.gtm_opportunity_assessment) {
            html += `
                <div class="enriched-section gtm-assessment">
                    <h4>🎯 GTM Opportunity Assessment</h4>
                    <p>${escapeHtml(enriched.gtm_opportunity_assessment)}</p>
                </div>
            `;
        }

        // Target Contacts Section
        if ((enriched.target_contacts && enriched.target_contacts.length > 0) ||
            (enriched.recommended_outreach_roles && enriched.recommended_outreach_roles.length > 0)) {
            html += `
                <div class="enriched-section contacts-section">
                    <div class="contacts-header">
                        <h4>📧 Target Contacts for Outreach</h4>
                        <button onclick="enrichContacts('${escapeHtml(company.domain)}')" class="btn-enrich-contacts" title="Get contact details via SignalHire">
                            Get Contact Info
                        </button>
                    </div>
            `;

            // Display target contacts
            if (enriched.target_contacts && enriched.target_contacts.length > 0) {
                html += '<div class="contacts-list">';
                enriched.target_contacts.forEach((contact, index) => {
                    const priorityClass = contact.priority === 'high' ? 'priority-high' :
                                         contact.priority === 'medium' ? 'priority-medium' : 'priority-low';

                    html += `
                        <div class="contact-card ${priorityClass}">
                            <div class="contact-main">
                                <div class="contact-info">
                                    <span class="contact-name">${escapeHtml(contact.name || 'Unknown')}</span>
                                    <span class="contact-title">${escapeHtml(contact.title || '')}</span>
                                    ${contact.department ? `<span class="contact-department">${escapeHtml(contact.department)}</span>` : ''}
                                </div>
                                <span class="contact-priority ${priorityClass}">${escapeHtml(contact.priority || 'medium')}</span>
                            </div>
                            ${contact.relevance ? `<p class="contact-relevance">${escapeHtml(contact.relevance)}</p>` : ''}
                            <div class="contact-actions">
                                ${contact.linkedin_url ? `<a href="${escapeHtml(contact.linkedin_url)}" target="_blank" class="btn-contact-link">LinkedIn</a>` : ''}
                                ${contact.email ? `<a href="mailto:${escapeHtml(contact.email)}" class="btn-contact-link email">📧 ${escapeHtml(contact.email)}</a>` : ''}
                                ${contact.phone ? `<a href="tel:${escapeHtml(contact.phone)}" class="btn-contact-link phone">📞 ${escapeHtml(contact.phone)}</a>` : ''}
                                ${!contact.email && !contact.contact_enriched ? `<button onclick="lookupContact('${escapeHtml(company.domain)}', ${index})" class="btn-lookup">Find Contact Info</button>` : ''}
                            </div>
                            ${contact.contact_enriched ? '<span class="contact-enriched-badge">✓ Verified</span>' : ''}
                        </div>
                    `;
                });
                html += '</div>';
            }

            // Display recommended roles if no specific contacts found
            if (enriched.recommended_outreach_roles && enriched.recommended_outreach_roles.length > 0) {
                html += `
                    <div class="recommended-roles">
                        <h5>Recommended Roles to Target:</h5>
                        <div class="roles-tags">
                            ${enriched.recommended_outreach_roles.map(role => `<span class="role-tag">${escapeHtml(role)}</span>`).join('')}
                        </div>
                    </div>
                `;
            }

            html += '</div>';
        }

        // Scrape info
        if (enriched.scrape_timestamp) {
            html += `<p class="scrape-timestamp">Data collected: ${new Date(enriched.scrape_timestamp).toLocaleDateString()}</p>`;
        }

        html += '</div>';
    } else if (company.enrichment_status === 'processing' || company.enrichment_status === 'pending') {
        html += `
            <div class="enrichment-pending">
                <div class="spinner"></div>
                <p>Company data is being collected...</p>
            </div>
        `;
    } else if (company.enrichment_status === 'failed') {
        html += `
            <div class="enrichment-failed">
                <p>Failed to collect company data.</p>
                ${company.enrichment_error ? `<p class="error-detail">${escapeHtml(company.enrichment_error)}</p>` : ''}
                <button onclick="retryEnrichment('${escapeHtml(company.domain)}')" class="btn-retry">Retry</button>
            </div>
        `;
    }

    html += '</div>';

    elements.companyModalBody.innerHTML = html;
    elements.companyModal.style.display = 'flex';
}

function closeCompanyModal() {
    elements.companyModal.style.display = 'none';
}

async function retryEnrichment(domain) {
    try {
        const response = await fetch(`/api/companies/${encodeURIComponent(domain)}/retry`, {
            method: 'POST'
        });

        if (response.ok) {
            // Refresh the company in the list
            const company = allCompanies.find(c => c.domain === domain);
            if (company) {
                company.enrichment_status = 'pending';
                filterCompanies();
            }
            closeCompanyModal();

            // Show feedback
            alert('Retry initiated. Refresh the page in a few minutes to see results.');
        }
    } catch (error) {
        console.error('Failed to retry enrichment:', error);
        alert('Failed to retry. Please try again.');
    }
}

async function enrichContacts(domain) {
    try {
        const btn = document.querySelector('.btn-enrich-contacts');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Enriching...';
        }

        const response = await fetch(`/api/companies/${encodeURIComponent(domain)}/enrich-contacts`, {
            method: 'POST'
        });

        const data = await response.json();

        if (response.ok) {
            alert(`Contact enrichment started for ${data.contacts_count} contacts. Refresh in a minute to see results.`);
        } else {
            alert(data.error || 'Failed to enrich contacts');
        }
    } catch (error) {
        console.error('Failed to enrich contacts:', error);
        alert('Failed to enrich contacts. Make sure SIGNALHIRE_API_KEY is configured.');
    } finally {
        const btn = document.querySelector('.btn-enrich-contacts');
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Get Contact Info';
        }
    }
}

async function lookupContact(domain, contactIndex) {
    const company = allCompanies.find(c => c.domain === domain);
    if (!company || !company.enriched_data || !company.enriched_data.target_contacts) {
        alert('Contact not found');
        return;
    }

    const contact = company.enriched_data.target_contacts[contactIndex];
    if (!contact) {
        alert('Contact not found');
        return;
    }

    try {
        const response = await fetch('/api/contacts/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: contact.name,
                linkedin_url: contact.linkedin_url,
                company_domain: domain,
                title: contact.title
            })
        });

        const data = await response.json();

        if (data.success && data.contact) {
            // Update the contact in our local data
            company.enriched_data.target_contacts[contactIndex] = {
                ...contact,
                ...data.contact
            };

            // Re-render the modal
            showCompanyDetails(domain);

            if (data.contact.email) {
                alert(`Found: ${data.contact.email}`);
            } else {
                alert('Contact found but no email available.');
            }
        } else {
            alert(data.message || 'Could not find contact information. Try SignalHire bulk enrichment.');
        }
    } catch (error) {
        console.error('Failed to lookup contact:', error);
        alert('Failed to lookup contact. Please try again.');
    }
}

// Helper functions
function getStatusClass(status) {
    switch (status) {
        case 'completed': return 'status-completed';
        case 'processing': return 'status-processing';
        case 'pending': return 'status-pending';
        case 'failed': return 'status-failed';
        default: return 'status-unknown';
    }
}

function getStatusLabel(status) {
    switch (status) {
        case 'completed': return 'Enriched';
        case 'processing': return 'Processing';
        case 'pending': return 'Pending';
        case 'failed': return 'Failed';
        default: return 'Unknown';
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

// Global functions
window.showCompanyDetails = showCompanyDetails;
window.closeCompanyModal = closeCompanyModal;
window.retryEnrichment = retryEnrichment;
window.loadCompanies = loadCompanies;
window.enrichContacts = enrichContacts;
window.lookupContact = lookupContact;
