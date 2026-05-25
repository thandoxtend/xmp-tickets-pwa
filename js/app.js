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
    console.log('🔄 Loading companies...');
    const token = localStorage.getItem('xmp_access_token');
    const currentUser = getCurrentUser();
    
    if (!token) {
        console.error('❌ No token found');
        return;
    }
    
    try {
        const res = await fetch('/api/companies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const companies = await res.json();
        console.log(`✅ Loaded ${companies.length} companies`);
        
        const select = document.getElementById('companySelect');
        const ticketSelect = document.getElementById('ticketCompany');
        
        if (select) {
            select.innerHTML = '<option value="">-- Select Company --</option>';
            
            for (const company of companies) {
                const opt = document.createElement('option');
                opt.value = company.id;
                // Mark user's default company
                const isUserCompany = (currentUser.companyId === company.id);
                opt.textContent = isUserCompany ? `${company.name} (Your Company)` : company.name;
                if (isUserCompany) opt.selected = true;
                select.appendChild(opt);
                
                if (ticketSelect) {
                    const opt2 = document.createElement('option');
                    opt2.value = company.id;
                    opt2.textContent = company.name;
                    ticketSelect.appendChild(opt2);
                }
            }
            
            // Set current company to user's default company or first company
            if (currentUser.companyId && companies.find(c => c.id === currentUser.companyId)) {
                currentCompanyId = currentUser.companyId;
                select.value = currentCompanyId;
            } else if (companies.length > 0) {
                currentCompanyId = companies[0].id;
                select.value = currentCompanyId;
            }
            
            if (currentCompanyId) {
                await loadTickets();
            }
        }
    } catch (err) {
        console.error('❌ Failed to load companies:', err);
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
    console.log(`📡 Fetching tickets for company: ${currentCompanyId}`);
    
    try {
        const res = await fetch(`${API_BASE}/api/tickets?company_id=${currentCompanyId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const data = await res.json();
        tickets = data.tickets || [];
        console.log(`✅ Loaded ${tickets.length} tickets`);
        
        renderTickets();
        updateStats();
    } catch (err) {
        console.error('Failed to load tickets:', err);
        tickets = [];
        renderTickets();
    }
}

// ========== RENDER TICKETS with FROM → TO ==========
function renderTickets() {
    const tbody = document.getElementById('ticketsTableBody');
    const empty = document.getElementById('emptyState');
    const currentUser = getCurrentUser();
    
    if (!tbody) return;
    
    // Filter tickets
    let filtered = [...tickets];
    
    if (currentStatusFilter !== 'all') {
        filtered = filtered.filter(t => t.status?.key === currentStatusFilter);
    }
    
    if (currentSearch) {
        const search = currentSearch.toLowerCase();
        filtered = filtered.filter(t => 
            t.title?.toLowerCase().includes(search) || 
            t.id?.toLowerCase().includes(search) ||
            t.ticket_number?.toLowerCase().includes(search)
        );
    }
    
    if (filtered.length === 0) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    
    if (empty) empty.classList.add('hidden');
    
    tbody.innerHTML = filtered.map(t => {
        // Determine FROM and TO companies
        const fromCompany = t.created_by?.company_name || t.from_company || t.company?.name || 'Unknown';
        const toCompany = t.assignee?.company_name || t.to_company || t.assigned_company || t.company?.name || 'Unknown';
        
        // Determine if ticket is inbound, outbound, or internal
        let fromToHtml = '';
        const userCompanyId = currentUser.companyId;
        const ticketCompanyId = t.company?.id || t.assigned_company_id;
        
        if (userCompanyId === ticketCompanyId) {
            // Internal ticket
            fromToHtml = `<span style="color:#10B981;">● Internal</span><br><small>${escapeHtml(fromCompany)}</small>`;
        } else if (t.created_by?.email === currentUser.email) {
            // Sent by current user
            fromToHtml = `<span style="color:#3B82F6;">📤 Sent to ${escapeHtml(toCompany)}</span>`;
        } else if (t.assignee?.email === currentUser.email) {
            // Assigned to current user
            fromToHtml = `<span style="color:#F59E0B;">📥 From ${escapeHtml(fromCompany)}</span>`;
        } else {
            // Cross-company
            fromToHtml = `${escapeHtml(fromCompany)} → ${escapeHtml(toCompany)}`;
        }
        
        return `
            <tr onclick="selectTicket('${t.id}')">
                <td class="ticket-id">${t.ticket_number || t.id.slice(0,8)}</td>
                <td><strong>${escapeHtml(t.title || 'Untitled')}</strong></td>
                <td>${fromToHtml}</td>
                <td>${t.type === 'operations' ? '🚛 Ops' : '📋 Admin'}</td>
                <td><span class="badge badge-${t.priority?.key || 'medium'}">${t.priority?.name || 'Medium'}</span></td>
                <td><span class="badge badge-${t.status?.key || 'open'}">${t.status?.name || 'Open'}</span></td>
                <td>${formatDate(t.created_at)}</td>
            </tr>
        `;
    }).join('');
}

// ========== SELECT TICKET DETAIL ==========
async function selectTicket(id) {
    currentTicketId = id;
    const token = localStorage.getItem('xmp_access_token');
    const currentUser = getCurrentUser();
    
    try {
        const res = await fetch(`${API_BASE}/api/tickets/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const t = await res.json();
        
        const fromCompany = t.created_by?.company_name || t.from_company || t.company?.name || 'Unknown';
        const toCompany = t.assignee?.company_name || t.to_company || t.assigned_company || t.company?.name || 'Unknown';
        const userCompanyId = currentUser.companyId;
        const ticketCompanyId = t.company?.id || t.assigned_company_id;
        
        let directionBadge = '';
        if (userCompanyId === ticketCompanyId) {
            directionBadge = '<span style="background:#10B98120; color:#10B981; padding:4px 8px; border-radius:6px; font-size:11px;">🔄 Internal Ticket</span>';
        } else if (t.created_by?.email === currentUser.email) {
            directionBadge = '<span style="background:#3B82F620; color:#3B82F6; padding:4px 8px; border-radius:6px; font-size:11px;">📤 Outbound Ticket</span>';
        } else if (t.assignee?.email === currentUser.email) {
            directionBadge = '<span style="background:#F59E0B20; color:#F59E0B; padding:4px 8px; border-radius:6px; font-size:11px;">📥 Inbound Ticket</span>';
        } else {
            directionBadge = '<span style="background:#64748B20; color:#64748B; padding:4px 8px; border-radius:6px; font-size:11px;">🔄 Cross-Company</span>';
        }
        
        document.getElementById('detailId').textContent = t.ticket_number || t.id.slice(0,8);
        document.getElementById('detailTitle').textContent = t.title || 'Untitled';
        
        document.getElementById('detailBody').innerHTML = `
            <div style="margin-bottom: 16px; padding: 12px; background:#0F172A; border-radius:12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                    <div><strong>FROM</strong><br>${escapeHtml(fromCompany)}</div>
                    <div>→</div>
                    <div><strong>TO</strong><br>${escapeHtml(toCompany)}</div>
                </div>
                <div style="text-align: center; margin-top: 8px;">${directionBadge}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">Description</div>
                <div style="background:#0F172A; padding:12px; border-radius:12px;">${escapeHtml(t.description || 'No description')}</div>
            </div>
            <div class="detail-section">
                <div class="detail-label">Details</div>
                <div><strong>Status:</strong> ${t.status?.name || 'Open'}</div>
                <div><strong>Priority:</strong> ${t.priority?.name || 'Medium'}</div>
                <div><strong>Created by:</strong> ${t.created_by?.name || '-'}</div>
                <div><strong>Assigned to:</strong> ${t.assignee?.name || 'Unassigned'}</div>
                <div><strong>Created:</strong> ${formatDateTime(t.created_at)}</div>
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

function renderMessages(messages) {
    const container = document.getElementById('messagesList');
    if (!container) return;
    
    if (messages.length === 0) {
        container.innerHTML = '<div style="color:#64748B; text-align:center; padding:20px;">No messages yet</div>';
        return;
    }
    
    container.innerHTML = messages.map(m => `
        <div style="margin-bottom: 16px; padding: 12px; background:#0F172A; border-radius:12px;">
            <div style="font-size:11px; color:#64748B; margin-bottom:4px;">${escapeHtml(m.created_by?.name || 'System')} · ${formatDateTime(m.created_at)}</div>
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
    const currentUser = getCurrentUser();
    
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
        from_company_id: currentUser.companyId,  // User's company
        from_company_name: currentUser.name,
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
    
    const chips = document.querySelectorAll('.filter-chip');
    chips.forEach(chip => {
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
    const currentUser = getCurrentUser();
    const userCompanyId = currentUser.companyId;
    
    const assigned = tickets.filter(t => t.assignee?.email === currentUser.email).length;
    const open = tickets.filter(t => t.status?.key === 'open').length;
    const urgent = tickets.filter(t => t.priority?.key === 'urgent').length;
    const cross = tickets.filter(t => t.company?.id !== userCompanyId && t.company?.id !== currentCompanyId).length;
    
    const statAssigned = document.getElementById('statAssigned');
    const statOpen = document.getElementById('statOpen');
    const statUrgent = document.getElementById('statUrgent');
    const statCross = document.getElementById('statCross');
    
    if (statAssigned) statAssigned.textContent = assigned;
    if (statOpen) statOpen.textContent = open;
    if (statUrgent) statUrgent.textContent = urgent;
    if (statCross) statCross.textContent = cross;
}

// ========== HELPER FUNCTIONS ==========
function escapeHtml(str) { 
    if (!str) return ''; 
    return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); 
}

function formatDate(dateStr) { 
    if (!dateStr) return ''; 
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000 / 60);
    
    if (diff < 1) return 'Just now';
    if (diff < 60) return `${diff} min ago`;
    if (diff < 1440) return `${Math.floor(diff / 60)} hours ago`;
    return `${Math.floor(diff / 1440)} days ago`;
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
document.getElementById('companySelect')?.addEventListener('change', (e) => { 
    currentCompanyId = e.target.value; 
    loadTickets(); 
});

// ========== INITIALIZE ==========
async function init() {
    console.log('Initializing XMP Tickets...');
    const currentUser = getCurrentUser();
    console.log('Current user:', currentUser);
    
    // Get user info from token
    try {
        const token = localStorage.getItem('xmp_access_token');
        if (token) {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userName = payload.given_name || payload.email?.split('@')[0] || 'User';
            const userAvatarEl = document.getElementById('userAvatar');
            const userNameEl = document.getElementById('userName');
            if (userNameEl) userNameEl.textContent = userName;
            if (userAvatarEl) userAvatarEl.textContent = userName.charAt(0).toUpperCase();
        }
    } catch(e) {}
    
    await loadCompanies();
}

// Start the app
init();