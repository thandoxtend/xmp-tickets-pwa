// XMP Tickets - Main Application
const API_BASE = '';

let currentCompanyId = null;
let currentTicketId = null;
let tickets = [];
let currentStatusFilter = 'all';
let currentSearch = '';
let selectedTicketType = 'operations';

// Get current user info
function getCurrentUser() {
    return {
        email: localStorage.getItem('xmp_user_email') || '',
        name: localStorage.getItem('xmp_user_name') || 'User',
        companyId: localStorage.getItem('xmp_user_company_id') || null
    };
}

// ========== LOAD COMPANIES ==========
async function loadCompanies() {
    console.log('Loading companies...');
    const token = localStorage.getItem('xmp_access_token');
    
    if (!token) {
        console.error('No token found');
        return;
    }
    
    try {
        const res = await fetch('/api/companies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const companies = await res.json();
        console.log('Loaded', companies.length, 'companies');
        
        const select = document.getElementById('companySelect');
        const ticketSelect = document.getElementById('ticketCompany');
        
        if (select) {
            select.innerHTML = '<option value="">-- Select Company --</option>';
            
            for (const company of companies) {
                const opt = document.createElement('option');
                opt.value = company.id;
                opt.textContent = company.name;
                select.appendChild(opt);
                
                if (ticketSelect) {
                    const opt2 = document.createElement('option');
                    opt2.value = company.id;
                    opt2.textContent = company.name;
                    ticketSelect.appendChild(opt2);
                }
            }
            
            if (companies.length > 0 && !currentCompanyId) {
                currentCompanyId = companies[0].id;
                select.value = currentCompanyId;
                await loadTickets();
            }
        }
    } catch (err) {
        console.error('Failed to load companies:', err);
        if (select) {
            select.innerHTML = '<option value="">Error loading companies</option>';
        }
    }
}

// ========== LOAD TICKETS ==========
async function loadTickets() {
    if (!currentCompanyId) {
        console.log('No company selected');
        return;
    }
    
    const token = localStorage.getItem('xmp_access_token');
    console.log('Fetching tickets for company:', currentCompanyId);
    
    try {
        const res = await fetch(`${API_BASE}/api/tickets?company_id=${currentCompanyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        
        if (data.tickets) {
            tickets = data.tickets;
        } else if (Array.isArray(data)) {
            tickets = data;
        } else {
            tickets = [];
        }
        
        console.log('Loaded', tickets.length, 'tickets');
        
        if (tickets.length > 0) {
            console.log('Sample ticket structure:', tickets[0]);
        }
        
        renderTickets();
        updateStats();
    } catch (err) {
        console.error('Failed to load tickets:', err);
        tickets = [];
        renderTickets();
    }
}

// ========== RENDER TICKETS ==========
function renderTickets() {
    const tbody = document.getElementById('ticketsTableBody');
    const empty = document.getElementById('emptyState');
    
    if (!tbody) return;
    
    let filtered = [...tickets];
    
    if (currentStatusFilter !== 'all') {
        filtered = filtered.filter(t => {
            const statusKey = t.status?.key || t.status || 'open';
            return statusKey === currentStatusFilter;
        });
    }
    
    if (currentSearch) {
        const search = currentSearch.toLowerCase();
        filtered = filtered.filter(t => 
            (t.title || '').toLowerCase().includes(search) || 
            (t.id || '').toLowerCase().includes(search) ||
            (t.ticket_number || '').toLowerCase().includes(search)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    
    if (empty) empty.classList.add('hidden');
    
    tbody.innerHTML = filtered.map(t => {
        const fromCompany = getFromCompany(t);
        const toCompany = getToCompany(t);
        const assignedTo = getAssignedTo(t);
        
        const statusName = t.status?.name || t.status_name || 'Open';
        const statusKey = t.status?.key || t.status_key || 'open';
        const priorityName = t.priority?.name || t.priority_name || 'Medium';
        const priorityKey = t.priority?.key || t.priority_key || 'medium';
        const type = t.type || t.category?.name || 'general';
        
        return `
            <tr onclick="selectTicket('${t.id}')">
                <td class="ticket-id">${t.ticket_number || t.id?.slice(0,8) || '---'}</td>
                <td><strong>${escapeHtml(t.title || 'Untitled')}</strong><br><small>${escapeHtml(fromCompany)} → ${escapeHtml(toCompany)}</small></td>
                <td>${type === 'operations' ? 'Ops' : (type === 'admin' ? 'Admin' : type)}</td>
                <td><span class="badge badge-${priorityKey}">${priorityName}</span></td>
                <td><span class="badge badge-${statusKey}">${statusName}</span></td>
                <td>${escapeHtml(assignedTo)}</td>
                <td>${formatDate(t.created_at || t.created_date)}</td>
            </tr>
        `;
    }).join('');
}

function getFromCompany(ticket) {
    if (ticket.created_by?.company?.name) return ticket.created_by.company.name;
    if (ticket.created_by?.company_name) return ticket.created_by.company_name;
    if (ticket.from_company) return ticket.from_company;
    if (ticket.from_company_name) return ticket.from_company_name;
    if (ticket.source_company?.name) return ticket.source_company.name;
    if (ticket.requestor?.company?.name) return ticket.requestor.company.name;
    if (ticket.reporter?.company?.name) return ticket.reporter.company.name;
    if (ticket.company?.name && ticket.direction === 'inbound') return ticket.company.name;
    return 'Unknown';
}

function getToCompany(ticket) {
    if (ticket.assignee?.company?.name) return ticket.assignee.company.name;
    if (ticket.assignee?.company_name) return ticket.assignee.company_name;
    if (ticket.to_company) return ticket.to_company;
    if (ticket.to_company_name) return ticket.to_company_name;
    if (ticket.destination_company?.name) return ticket.destination_company.name;
    if (ticket.assigned_company?.name) return ticket.assigned_company.name;
    if (ticket.company?.name && ticket.direction === 'outbound') return ticket.company.name;
    if (ticket.company?.name) return ticket.company.name + ' (Internal)';
    return 'Unknown';
}

function getAssignedTo(ticket) {
    if (ticket.assignee?.name) return ticket.assignee.name;
    if (ticket.assignee_name) return ticket.assignee_name;
    if (ticket.assigned_to?.name) return ticket.assigned_to.name;
    if (ticket.assigned_to_name) return ticket.assigned_to_name;
    if (ticket.assigned_user) return ticket.assigned_user;
    return 'Unassigned';
}

// ========== SELECT TICKET DETAIL ==========
async function selectTicket(id) {
    currentTicketId = id;
    const token = localStorage.getItem('xmp_access_token');
    
    try {
        const res = await fetch(`${API_BASE}/api/tickets/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const t = await res.json();
        
        const fromCompany = getFromCompany(t);
        const toCompany = getToCompany(t);
        const assignedTo = getAssignedTo(t);
        const assignedCompany = getAssignedCompany(t);
        
        document.getElementById('detailId').textContent = t.ticket_number || t.id?.slice(0,8) || '---';
        document.getElementById('detailTitle').textContent = t.title || 'Untitled';
        
        document.getElementById('detailBody').innerHTML = `
            <div style="margin-bottom: 16px; padding: 12px; background:#0F172A; border-radius:12px;">
                <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; margin-bottom: 16px;">
                    <div><strong>FROM</strong><br>${escapeHtml(fromCompany)}</div>
                    <div style="font-size: 20px;">→</div>
                    <div><strong>TO</strong><br>${escapeHtml(toCompany)}</div>
                </div>
                <hr style="border-color: #334155; margin: 12px 0;">
                <div><strong>Assigned To:</strong> ${escapeHtml(assignedTo)}</div>
                <div><strong>Assigned Company:</strong> ${escapeHtml(assignedCompany)}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">Description</div>
                <div style="background:#0F172A; padding:12px; border-radius:12px;">${escapeHtml(t.description || 'No description')}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">Details</div>
                <div><strong>Status:</strong> ${t.status?.name || t.status_name || 'Open'}</div>
                <div><strong>Priority:</strong> ${t.priority?.name || t.priority_name || 'Medium'}</div>
                <div><strong>Created by:</strong> ${t.created_by?.name || t.created_by_name || '-'}</div>
                <div><strong>Created:</strong> ${formatDateTime(t.created_at || t.created_date)}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">Messages</div>
                <div id="messagesList"></div>
            </div>
            <div class="detail-section">
                <textarea id="replyText" class="reply-input" rows="2" placeholder="Type your reply..."></textarea>
                <button class="btn-send" onclick="sendReply()">Send Reply</button>
            </div>
        `;
        
        renderMessages(t.messages || []);
        document.getElementById('detailPane').classList.add('open');
    } catch (err) {
        console.error('Failed to load ticket detail:', err);
    }
}

function getAssignedCompany(ticket) {
    if (ticket.assignee?.company?.name) return ticket.assignee.company.name;
    if (ticket.assignee?.company_name) return ticket.assignee.company_name;
    if (ticket.assigned_company?.name) return ticket.assigned_company.name;
    if (ticket.assigned_company_name) return ticket.assigned_company_name;
    return '-';
}

function renderMessages(messages) {
    const container = document.getElementById('messagesList');
    if (!container) return;
    
    if (!messages || messages.length === 0) {
        container.innerHTML = '<div style="color:#64748B; text-align:center; padding:20px;">No messages yet</div>';
        return;
    }
    
    container.innerHTML = messages.map(m => `
        <div style="margin-bottom: 16px; padding: 12px; background:#0F172A; border-radius:12px;">
            <div style="font-size:11px; color:#64748B; margin-bottom:4px;">${escapeHtml(m.created_by?.name || m.from_name || 'System')} · ${formatDateTime(m.created_at || m.timestamp)}</div>
            <div>${escapeHtml(m.message || m.content || m.text)}</div>
        </div>
    `).join('');
}

// ========== SEND REPLY ==========
async function sendReply() {
    const text = document.getElementById('replyText')?.value;
    if (!text || !currentTicketId) return;
    
    const token = localStorage.getItem('xmp_access_token');
    
    try {
        await fetch(`${API_BASE}/api/tickets/${currentTicketId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ message: text })
        });
        
        document.getElementById('replyText').value = '';
        selectTicket(currentTicketId);
        loadTickets();
    } catch (err) {
        console.error('Failed to send reply:', err);
        alert('Failed to send message');
    }
}

// ========== CREATE TICKET ==========
function selectTicketType(type) {
    selectedTicketType = type;
    
    const opsFields = document.getElementById('opsFields');
    const adminFields = document.getElementById('adminFields');
    
    if (type === 'operations') {
        if (opsFields) opsFields.style.display = 'block';
        if (adminFields) adminFields.style.display = 'none';
    } else {
        if (opsFields) opsFields.style.display = 'none';
        if (adminFields) adminFields.style.display = 'block';
    }
}

function selectPriority(priority) {
    document.getElementById('ticketPriority').value = priority;
    
    document.querySelectorAll('.priority-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    if (event && event.target) event.target.classList.add('active');
}

async function submitTicket() {
    const title = document.getElementById('ticketTitle')?.value.trim();
    const description = document.getElementById('ticketDesc')?.value.trim();
    const companyId = document.getElementById('ticketCompany')?.value;
    const priority = document.getElementById('ticketPriority')?.value;
    
    if (!title || !description) {
        alert('Please fill in title and description');
        return;
    }
    
    if (!companyId) {
        alert('Please select a company');
        return;
    }
    
    const payload = {
        title: title,
        description: description,
        company_id: companyId,
        type: selectedTicketType,
        priority: priority || 'medium'
    };
    
    if (selectedTicketType === 'operations') {
        const vehicle = document.getElementById('ticketVehicle')?.value;
        if (vehicle) payload.fleet_number = vehicle;
    }
    
    const token = localStorage.getItem('xmp_access_token');
    
    try {
        const response = await fetch(`${API_BASE}/api/tickets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        });
        
        if (response.ok) {
            closeModal();
            document.getElementById('ticketTitle').value = '';
            document.getElementById('ticketDesc').value = '';
            document.getElementById('ticketVehicle').value = '';
            await loadTickets();
            alert('Ticket created successfully!');
        } else {
            const error = await response.json();
            alert('Failed to create ticket: ' + (error.error || 'Unknown error'));
        }
    } catch (err) {
        console.error('Failed to create ticket:', err);
        alert('Failed to create ticket');
    }
}

// ========== FILTER FUNCTIONS ==========
function filterTickets(status) {
    currentStatusFilter = status;
    
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.classList.remove('active');
        if (chip.getAttribute('data-filter') === status) {
            chip.classList.add('active');
        }
    });
    
    renderTickets();
}

function searchTickets() {
    currentSearch = document.getElementById('searchInput')?.value || '';
    renderTickets();
}

// ========== UPDATE STATS ==========
function updateStats() {
    const open = tickets.filter(t => {
        const statusKey = t.status?.key || t.status || 'open';
        return statusKey === 'open';
    }).length;
    
    const urgent = tickets.filter(t => {
        const priorityKey = t.priority?.key || t.priority || 'medium';
        return priorityKey === 'urgent';
    }).length;
    
    const assignedToMe = tickets.filter(t => {
        const currentUser = getCurrentUser();
        return t.assignee?.email === currentUser.email || t.assignee_name === currentUser.name;
    }).length;
    
    const statAssigned = document.getElementById('statAssigned');
    const statOpen = document.getElementById('statOpen');
    const statUrgent = document.getElementById('statUrgent');
    
    if (statAssigned) statAssigned.textContent = assignedToMe;
    if (statOpen) statOpen.textContent = open;
    if (statUrgent) statUrgent.textContent = urgent;
}

// ========== HELPER FUNCTIONS ==========
function escapeHtml(str) { 
    if (!str) return ''; 
    return str.replace(/[&<>]/g, function(m) {
        if (m === '&') return '&amp;';
        if (m === '<') return '&lt;';
        if (m === '>') return '&gt;';
        return m;
    });
}

function formatDate(dateStr) { 
    if (!dateStr) return ''; 
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000 / 60);
    
    if (diff < 1) return 'Just now';
    if (diff < 60) return diff + ' min ago';
    if (diff < 1440) return Math.floor(diff / 60) + ' hours ago';
    return Math.floor(diff / 1440) + ' days ago';
}

function formatDateTime(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString();
}

function closeDetail() { 
    document.getElementById('detailPane').classList.remove('open'); 
}

function openNewTicket() { 
    document.getElementById('modalOverlay').style.display = 'flex'; 
}

function closeModal() { 
    document.getElementById('modalOverlay').style.display = 'none'; 
}

function logout() { 
    localStorage.clear(); 
    window.location.href = '/login.html'; 
}

// ========== EVENT LISTENERS ==========
document.getElementById('companySelect')?.addEventListener('change', function(e) { 
    currentCompanyId = e.target.value; 
    loadTickets(); 
});

// ========== INITIALIZE ==========
async function init() {
    console.log('Initializing XMP Tickets...');
    
    try {
        const token = localStorage.getItem('xmp_access_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userName = payload.given_name || payload.email?.split('@')[0] || 'User';
            const userAvatarEl = document.getElementById('userAvatar');
            const userNameEl = document.getElementById('userName');
            if (userNameEl) userNameEl.textContent = userName;
            if (userAvatarEl) userAvatarEl.textContent = userName.charAt(0).toUpperCase();
            
            if (payload.email) {
                localStorage.setItem('xmp_user_email', payload.email);
            }
        }
    } catch(e) {
        console.log('Could not decode token', e);
    }
    
    await loadCompanies();
}

// Start the app
init();