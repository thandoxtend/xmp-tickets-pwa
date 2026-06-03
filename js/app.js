// ========== XMP TICKETS — MAIN APP ==========
// Depends on: /js/api.js (loaded before this script)

let currentCompanyId = null;
let currentTicketId = null;
let tickets = [];
let currentStatusFilter = 'all';
let currentSearch = '';
let selectedTicketType = 'operations';

// ========== USER PROFILE ==========
function getCurrentUser() {
    const token = localStorage.getItem('xmp_access_token');
    let payload = {};
    try { payload = JSON.parse(atob(token.split('.')[1])); } catch (e) {}

    // Cognito groups = roles
    const groups = payload['cognito:groups'] || [];
    const role = deriveRole(groups, payload);

    return {
        email: payload.email || localStorage.getItem('xmp_user_email') || '',
        name: payload.given_name || localStorage.getItem('xmp_user_name') || 'User',
        fullName: (
            ((payload.given_name || '') + ' ' + (payload.family_name || '')).trim()
        ) || localStorage.getItem('xmp_user_full_name') || 'User',
        companyId: payload['custom:company_id'] || localStorage.getItem('xmp_user_company_id') || null,
        companyName: payload['custom:company_name'] || localStorage.getItem('xmp_user_company') || null,
        groups,
        role,
        sub: payload.sub || ''
    };
}

function deriveRole(groups, payload) {
    // Map Cognito groups → friendly role label
    if (!groups || groups.length === 0) {
        // Fall back to custom attributes
        const attr = payload['custom:role'] || payload['custom:user_type'] || '';
        if (attr) return formatRole(attr);
        return 'Viewer';
    }
    // Priority order
    const priority = ['admin', 'superadmin', 'super_admin', 'manager', 'operator', 'dispatcher', 'driver', 'viewer'];
    for (const p of priority) {
        if (groups.some(g => g.toLowerCase().includes(p))) return formatRole(p);
    }
    return formatRole(groups[0]);
}

function formatRole(raw) {
    return raw.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getRoleBadgeColor(role) {
    const r = role.toLowerCase();
    if (r.includes('admin')) return '#EF4444';
    if (r.includes('manager')) return '#F97316';
    if (r.includes('operator') || r.includes('dispatcher')) return '#3B82F6';
    if (r.includes('driver')) return '#10B981';
    return '#6B7280';
}

// ========== INIT ==========
async function init() {
    console.log('🚀 XMP Tickets initialising...');

    const user = getCurrentUser();
    console.log('👤 User:', user);

    // --- Navbar: name, avatar, role badge ---
    const nameEl = document.getElementById('userName');
    const avatarEl = document.getElementById('userAvatar');
    const emailEl = document.getElementById('userEmail');
    const roleBadgeEl = document.getElementById('userRoleBadge');

    if (nameEl) nameEl.textContent = user.fullName || user.name;
    if (emailEl) emailEl.textContent = user.email;
    if (avatarEl) avatarEl.textContent = (user.fullName || user.name).charAt(0).toUpperCase();
    if (roleBadgeEl) {
        roleBadgeEl.textContent = user.role;
        roleBadgeEl.style.background = getRoleBadgeColor(user.role) + '22';
        roleBadgeEl.style.color = getRoleBadgeColor(user.role);
        roleBadgeEl.style.border = `1px solid ${getRoleBadgeColor(user.role)}44`;
    }

    await loadCompanies();
}

// ========== COMPANIES ==========
async function loadCompanies() {
    console.log('📡 Loading companies...');
    showTableLoading();

    const companies = await API.getCompanies();

    if (!companies || companies.length === 0) {
        console.warn('⚠️ No companies returned');
        showTableError('No companies found. Check your connection or token.');
        return;
    }

    console.log(`✅ ${companies.length} companies loaded`);

    const select = document.getElementById('companySelect');
    const ticketSelect = document.getElementById('ticketCompany');

    if (select) {
        select.innerHTML = '<option value="">— All Companies —</option>';
        companies.forEach(c => {
            const opt = new Option(c.name, c.id);
            select.appendChild(opt);
            if (ticketSelect) ticketSelect.appendChild(new Option(c.name, c.id));
        });

        // Auto-select user's own company if known
        const user = getCurrentUser();
        if (user.companyId && companies.find(c => c.id === user.companyId)) {
            currentCompanyId = user.companyId;
            select.value = currentCompanyId;
        } else if (companies.length > 0) {
            currentCompanyId = companies[0].id;
            select.value = currentCompanyId;
        }
    }

    await loadTickets();
}

// ========== TICKETS ==========
async function loadTickets() {
    if (!currentCompanyId) {
        showTableError('Select a company to load tickets.');
        return;
    }

    showTableLoading();
    console.log(`📡 Loading tickets for company: ${currentCompanyId}`);

    const data = await API.getTickets(currentCompanyId);
    tickets = Array.isArray(data) ? data : [];

    console.log(`✅ ${tickets.length} tickets loaded`);
    if (tickets.length > 0) console.log('Sample:', tickets[0]);

    renderTickets();
    updateStats();
}

// ========== RENDER TICKETS ==========
function renderTickets() {
    const tbody = document.getElementById('ticketsTableBody');
    const empty = document.getElementById('emptyState');
    if (!tbody) return;

    let filtered = [...tickets];

    if (currentStatusFilter !== 'all') {
        filtered = filtered.filter(t => {
            const key = t.status?.key || t.status || 'open';
            return key === currentStatusFilter;
        });
    }

    if (currentSearch) {
        const s = currentSearch.toLowerCase();
        filtered = filtered.filter(t =>
            (t.title || '').toLowerCase().includes(s) ||
            (t.id || '').toLowerCase().includes(s) ||
            (t.ticket_number || '').toLowerCase().includes(s)
        );
    }

    hideTableLoading();

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    const user = getCurrentUser();

    tbody.innerHTML = filtered.map(t => {
        const fromCompany = getFromCompany(t);
        const toCompany   = getToCompany(t);
        const assignedTo  = getAssignedTo(t);
        const statusName  = t.status?.name  || t.status_name  || 'Open';
        const statusKey   = t.status?.key   || t.status_key   || 'open';
        const priorityName= t.priority?.name|| t.priority_name|| 'Medium';
        const priorityKey = t.priority?.key || t.priority_key || 'medium';
        const type        = t.type || t.category?.name || 'general';

        // Highlight if assigned to current user
        const isAssignedToMe = (
            t.assignee?.email === user.email ||
            t.assignee_name   === user.name
        );
        const rowClass = isAssignedToMe ? 'assigned-to-me' : '';

        return `
            <tr class="${rowClass}" onclick="selectTicket('${t.id}')">
                <td class="ticket-id">${t.ticket_number || (t.id || '').slice(0,8) || '---'}</td>
                <td>
                    <strong>${escapeHtml(t.title || 'Untitled')}</strong>
                    <br><small style="color:#64748B">${escapeHtml(fromCompany)} → ${escapeHtml(toCompany)}</small>
                </td>
                <td>
                    <span style="font-size:12px;color:#94A3B8">
                        ${type === 'operations' ? '🚛 Ops' : type === 'admin' ? '📋 Admin' : escapeHtml(type)}
                    </span>
                </td>
                <td><span class="badge badge-${priorityKey}">${priorityName}</span></td>
                <td><span class="badge badge-${statusKey.replace(/ /g,'-')}">${statusName}</span></td>
                <td>
                    ${isAssignedToMe
                        ? `<span style="color:#3B82F6;font-weight:600">⚡ You</span>`
                        : escapeHtml(assignedTo)
                    }
                </td>
                <td style="color:#64748B;font-size:13px">${formatDate(t.created_at || t.created_date)}</td>
            </tr>
        `;
    }).join('');
}

// ========== TICKET DETAIL ==========
async function selectTicket(id) {
    currentTicketId = id;
    const t = await API.getTicket(id);
    if (!t) return;

    const fromCompany   = getFromCompany(t);
    const toCompany     = getToCompany(t);
    const assignedTo    = getAssignedTo(t);
    const assignedCo    = getAssignedCompany(t);

    document.getElementById('detailId').textContent    = t.ticket_number || (t.id || '').slice(0,8) || '---';
    document.getElementById('detailTitle').textContent = t.title || 'Untitled';

    document.getElementById('detailBody').innerHTML = `
        <div style="margin-bottom:16px;padding:14px;background:#0F172A;border-radius:12px;">
            <div style="display:grid;grid-template-columns:1fr auto 1fr;gap:12px;margin-bottom:14px;align-items:center">
                <div><div style="font-size:10px;color:#64748B;margin-bottom:4px">FROM</div><strong>${escapeHtml(fromCompany)}</strong></div>
                <div style="font-size:18px;color:#64748B">→</div>
                <div><div style="font-size:10px;color:#64748B;margin-bottom:4px">TO</div><strong>${escapeHtml(toCompany)}</strong></div>
            </div>
            <hr style="border-color:#334155;margin:10px 0">
            <div style="font-size:13px"><strong>Assigned To:</strong> ${escapeHtml(assignedTo)}</div>
            <div style="font-size:13px;margin-top:4px"><strong>Assigned Company:</strong> ${escapeHtml(assignedCo)}</div>
        </div>
        <div class="detail-section">
            <div class="detail-label">Status & Priority</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
                <span class="badge badge-${t.status?.key||'open'}">${t.status?.name||'Open'}</span>
                <span class="badge badge-${t.priority?.key||'medium'}">${t.priority?.name||'Medium'}</span>
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-label">Description</div>
            <div style="background:#0F172A;padding:12px;border-radius:12px;font-size:14px;line-height:1.6">${escapeHtml(t.description || 'No description provided.')}</div>
        </div>
        <div class="detail-section">
            <div class="detail-label">Details</div>
            <div style="font-size:13px;line-height:1.8">
                <div><strong>Created by:</strong> ${escapeHtml(t.created_by?.name || t.created_by_name || '—')}</div>
                <div><strong>Created:</strong> ${formatDateTime(t.created_at || t.created_date)}</div>
                ${t.updated_at ? `<div><strong>Updated:</strong> ${formatDateTime(t.updated_at)}</div>` : ''}
            </div>
        </div>
        <div class="detail-section">
            <div class="detail-label">Messages</div>
            <div id="messagesList"></div>
        </div>
        <div class="detail-section">
            <textarea id="replyText" class="reply-input" rows="3" placeholder="Type your reply..."></textarea>
            <button class="btn-send" onclick="sendReply()">Send Reply</button>
        </div>
    `;

    renderMessages(t.messages || []);
    document.getElementById('detailPane').classList.add('open');
}

function renderMessages(messages) {
    const container = document.getElementById('messagesList');
    if (!container) return;
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div style="color:#64748B;text-align:center;padding:20px;font-size:13px">No messages yet</div>';
        return;
    }
    container.innerHTML = messages.map(m => `
        <div style="margin-bottom:12px;padding:12px;background:#0F172A;border-radius:10px">
            <div style="font-size:11px;color:#64748B;margin-bottom:6px">
                ${escapeHtml(m.created_by?.name || m.from_name || 'System')} &middot; ${formatDateTime(m.created_at || m.timestamp)}
            </div>
            <div style="font-size:14px">${escapeHtml(m.message || m.content || m.text || '')}</div>
        </div>
    `).join('');
}

// ========== SEND REPLY ==========
async function sendReply() {
    const text = document.getElementById('replyText')?.value?.trim();
    if (!text || !currentTicketId) return;

    const btn = document.querySelector('.btn-send');
    if (btn) { btn.textContent = 'Sending...'; btn.disabled = true; }

    await API.sendMessage(currentTicketId, text);
    document.getElementById('replyText').value = '';
    if (btn) { btn.textContent = 'Send Reply'; btn.disabled = false; }

    await selectTicket(currentTicketId);
    await loadTickets();
}

// ========== STATS ==========
function updateStats() {
    const user = getCurrentUser();

    const open = tickets.filter(t => {
        const k = t.status?.key || t.status || 'open';
        return k === 'open';
    }).length;

    const urgent = tickets.filter(t => {
        const k = t.priority?.key || t.priority || 'medium';
        return k === 'urgent';
    }).length;

    const assignedToMe = tickets.filter(t =>
        t.assignee?.email === user.email || t.assignee_name === user.name
    ).length;

    const crossCompany = tickets.filter(t => {
        const from = getFromCompany(t);
        const to   = getToCompany(t);
        return from !== to && from !== 'Unknown' && to !== 'Unknown';
    }).length;

    const el = id => document.getElementById(id);
    if (el('statAssigned')) el('statAssigned').textContent = assignedToMe;
    if (el('statOpen'))     el('statOpen').textContent     = open;
    if (el('statUrgent'))   el('statUrgent').textContent   = urgent;
    if (el('statCross'))    el('statCross').textContent     = crossCompany;
}

// ========== CREATE TICKET ==========
function selectTicketType(type) {
    selectedTicketType = type;
    document.getElementById('opsFields').style.display   = type === 'operations' ? 'block' : 'none';
    document.getElementById('adminFields').style.display = type === 'admin'      ? 'block' : 'none';
    document.querySelectorAll('.type-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.type === type)
    );
}

function selectPriority(priority) {
    document.getElementById('ticketPriority').value = priority;
    document.querySelectorAll('.priority-btn').forEach(b =>
        b.classList.toggle('active', b.classList.contains(priority))
    );
}

async function submitTicket() {
    const title       = document.getElementById('ticketTitle')?.value.trim();
    const description = document.getElementById('ticketDesc')?.value.trim();
    const companyId   = document.getElementById('ticketCompany')?.value;
    const priority    = document.getElementById('ticketPriority')?.value || 'medium';

    if (!title || !description) { alert('Please fill in title and description'); return; }
    if (!companyId) { alert('Please select a company'); return; }

    const payload = { title, description, company_id: companyId, type: selectedTicketType, priority };

    if (selectedTicketType === 'operations') {
        const vehicle = document.getElementById('ticketVehicle')?.value;
        if (vehicle) payload.fleet_number = vehicle;
    }

    const submitBtn = document.querySelector('.btn-submit');
    if (submitBtn) { submitBtn.textContent = 'Creating...'; submitBtn.disabled = true; }

    const result = await API.createTicket(payload);

    if (submitBtn) { submitBtn.textContent = 'Create Ticket'; submitBtn.disabled = false; }

    if (result && !result.error) {
        closeModal();
        ['ticketTitle','ticketDesc','ticketVehicle'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        await loadTickets();
        showToast('✅ Ticket created successfully!');
    } else {
        alert('Failed to create ticket: ' + (result?.error || result?.message || 'Unknown error'));
    }
}

// ========== FILTERS ==========
function filterTickets(status) {
    currentStatusFilter = status;
    document.querySelectorAll('.filter-chip').forEach(c => {
        c.classList.toggle('active', c.dataset.filter === status);
    });
    renderTickets();
}

function searchTickets() {
    currentSearch = document.getElementById('searchInput')?.value || '';
    renderTickets();
}

// ========== TABLE STATE HELPERS ==========
function showTableLoading() {
    const tbody = document.getElementById('ticketsTableBody');
    if (tbody) tbody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:40px;color:#64748B">
            <div style="display:inline-block;width:24px;height:24px;border:2px solid #334155;border-top-color:#3B82F6;border-radius:50%;animation:spin 0.6s linear infinite;vertical-align:middle;margin-right:10px"></div>
            Loading tickets...
        </td></tr>`;
    document.getElementById('emptyState')?.classList.add('hidden');
}

function hideTableLoading() {
    // renderTickets handles the actual DOM update
}

function showTableError(msg) {
    const tbody = document.getElementById('ticketsTableBody');
    if (tbody) tbody.innerHTML = `
        <tr><td colspan="7" style="text-align:center;padding:40px;color:#F87171">${escapeHtml(msg)}</td></tr>`;
}

function showToast(msg) {
    let toast = document.getElementById('xmpToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'xmpToast';
        toast.style.cssText = `
            position:fixed;bottom:24px;right:24px;background:#1E293B;
            color:white;padding:14px 20px;border-radius:12px;font-size:14px;
            border:1px solid #334155;box-shadow:0 10px 30px rgba(0,0,0,0.3);
            z-index:9999;transition:opacity 0.3s;font-family:Inter,sans-serif;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// ========== HELPERS ==========
function getFromCompany(t) {
    return t.created_by?.company?.name || t.created_by?.company_name ||
           t.from_company || t.from_company_name ||
           t.source_company?.name || t.requestor?.company?.name ||
           t.reporter?.company?.name || 'Unknown';
}
function getToCompany(t) {
    return t.assignee?.company?.name || t.assignee?.company_name ||
           t.to_company || t.to_company_name ||
           t.destination_company?.name || t.assigned_company?.name ||
           (t.company?.name ? t.company.name + ' (Internal)' : 'Unknown');
}
function getAssignedTo(t) {
    return t.assignee?.name || t.assignee_name ||
           t.assigned_to?.name || t.assigned_to_name ||
           t.assigned_user || 'Unassigned';
}
function getAssignedCompany(t) {
    return t.assignee?.company?.name || t.assignee?.company_name ||
           t.assigned_company?.name  || t.assigned_company_name || '—';
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, m =>
        ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])
    );
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr), now = new Date();
    const diff = Math.floor((now - d) / 60000);
    if (diff < 1)    return 'Just now';
    if (diff < 60)   return diff + 'm ago';
    if (diff < 1440) return Math.floor(diff / 60) + 'h ago';
    return Math.floor(diff / 1440) + 'd ago';
}

function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('en-ZA', {
        day:'2-digit', month:'short', year:'numeric',
        hour:'2-digit', minute:'2-digit'
    });
}

function closeDetail()    { document.getElementById('detailPane').classList.remove('open'); }
function openNewTicket()  { document.getElementById('modalOverlay').style.display = 'flex'; }
function closeModal()     { document.getElementById('modalOverlay').style.display = 'none'; }
function logout()         { if (window.Auth) Auth.logout(); else { localStorage.clear(); window.location.href = '/login.html'; } }

// ========== EVENT LISTENERS ==========
document.getElementById('companySelect')?.addEventListener('change', e => {
    currentCompanyId = e.target.value;
    loadTickets();
});

// ========== KICK OFF ==========
init();