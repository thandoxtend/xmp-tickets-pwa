// XMP Tickets - Main Application
const API_BASE = '';

let currentCompanyId = null;
let currentTicketId = null;
let tickets = [];

// Load companies
// Update the loadCompanies function to show ticket counts
async function loadCompanies() {
    console.log('🔄 Loading companies...');
    const token = localStorage.getItem('xmp_access_token');
    
    if (!token) {
        console.error('❌ No token found');
        return;
    }
    
    try {
        const res = await fetch('/api/companies', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        
        const companies = await res.json();
        console.log(`✅ Loaded ${companies.length} companies`);
        
        const select = document.getElementById('companySelect');
        const ticketSelect = document.getElementById('ticketCompany');
        
        select.innerHTML = '<option value="">-- Select Company --</option>';
        
        // Fetch ticket counts for each company
        for (const company of companies) {
            const ticketRes = await fetch(`/api/tickets?company_id=${company.id}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const ticketData = await ticketRes.json();
            const ticketCount = ticketData.tickets?.length || 0;
            
            const opt = document.createElement('option');
            opt.value = company.id;
            opt.textContent = `${company.name} (${ticketCount} tickets)`;
            select.appendChild(opt);
            
            if (ticketSelect) {
                const opt2 = document.createElement('option');
                opt2.value = company.id;
                opt2.textContent = company.name;
                ticketSelect.appendChild(opt2);
            }
        }
        
        if (companies.length > 0) {
            currentCompanyId = companies[0].id;
            select.value = currentCompanyId;
            await loadTickets();
        }
    } catch (err) {
        console.error('❌ Failed to load companies:', err);
    }
}
// Load tickets
async function loadTickets() {
    if (!currentCompanyId) return;
    
    try {
        const res = await fetch(`${API_BASE}/api/tickets?company_id=${currentCompanyId}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('xmp_access_token')}` }
        });
        const data = await res.json();
        tickets = data.tickets || [];
        renderTickets();
        updateStats();
    } catch (err) {
        console.error('Failed to load tickets:', err);
    }
}

// Render tickets table
function renderTickets() {
    const tbody = document.getElementById('ticketsTableBody');
    const empty = document.getElementById('emptyState');
    
    if (!tickets.length) {
        tbody.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    tbody.innerHTML = tickets.map(t => `
        <tr onclick="selectTicket('${t.id}')">
            <td>${t.ticket_number || t.id.slice(0,8)}</td>
            <td><strong>${escapeHtml(t.title)}</strong><br><small>${escapeHtml(t.company?.name || '')}</small></td>
            <td>${t.type === 'operations' ? '🚛 Ops' : '📋 Admin'}</td>
            <td><span class="badge badge-${t.priority?.key || 'medium'}">${t.priority?.name || 'Medium'}</span></td>
            <td><span class="badge badge-${t.status?.key || 'open'}">${t.status?.name || 'Open'}</span></td>
            <td>${t.assignee?.name || '-'}</td>
            <td>${formatDate(t.created_at)}</td>
        </tr>
    `).join('');
}

// Select and show ticket detail
async function selectTicket(id) {
    currentTicketId = id;
    
    try {
        const res = await fetch(`${API_BASE}/api/tickets/${id}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('xmp_access_token')}` }
        });
        const t = await res.json();
        
        document.getElementById('detailId').textContent = t.ticket_number || t.id.slice(0,8);
        document.getElementById('detailTitle').textContent = t.title;
        
        document.getElementById('detailBody').innerHTML = `
            <div class="detail-section"><div class="detail-label">Description</div><div style="background:#0F172A; padding:12px; border-radius:12px;">${escapeHtml(t.description || 'No description')}</div></div>
            <div class="detail-section"><div class="detail-label">Details</div><div><strong>From:</strong> ${t.created_by?.name || '-'}</div><div><strong>To:</strong> ${t.assignee?.name || '-'}</div><div><strong>Company:</strong> ${t.company?.name || '-'}</div></div>
            <div class="detail-section"><div class="detail-label">Messages</div><div id="messagesList"></div></div>
            <div class="detail-section"><textarea id="replyText" class="reply-input" rows="2" placeholder="Type your reply..."></textarea><button class="btn-send" onclick="sendReply()">Send Reply</button></div>
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
    
    container.innerHTML = messages.map(m => `
        <div style="margin-bottom: 16px; padding: 12px; background:#0F172A; border-radius:12px;">
            <div style="font-size:11px; color:#64748B; margin-bottom:4px;">${m.created_by?.name || 'System'} · ${formatDate(m.created_at)}</div>
            <div>${escapeHtml(m.message || m.content || m.text)}</div>
        </div>
    `).join('');
}

async function sendReply() {
    const text = document.getElementById('replyText')?.value;
    if (!text || !currentTicketId) return;
    
    try {
        await fetch(`${API_BASE}/api/tickets/${currentTicketId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('xmp_access_token')}`
            },
            body: JSON.stringify({ message: text })
        });
        
        document.getElementById('replyText').value = '';
        selectTicket(currentTicketId);
        loadTickets();
    } catch (err) {
        console.error('Failed to send reply:', err);
    }
}

// Create new ticket
async function submitTicket() {
    const payload = {
        title: document.getElementById('ticketTitle').value,
        description: document.getElementById('ticketDesc').value,
        company_id: document.getElementById('ticketCompany').value,
        type: document.getElementById('ticketType').value,
        priority: document.getElementById('ticketPriority').value.toLowerCase()
    };
    
    try {
        await fetch(`${API_BASE}/api/tickets`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('xmp_access_token')}`
            },
            body: JSON.stringify(payload)
        });
        
        closeModal();
        loadTickets();
    } catch (err) {
        console.error('Failed to create ticket:', err);
    }
}

// Update stats
function updateStats() {
    const userEmail = localStorage.getItem('xmp_user_email');
    document.getElementById('statAssigned').textContent = tickets.filter(t => t.assignee?.email === userEmail).length;
    document.getElementById('statOpen').textContent = tickets.filter(t => t.status?.key === 'open').length;
    document.getElementById('statUrgent').textContent = tickets.filter(t => t.priority?.key === 'urgent').length;
    document.getElementById('statCross').textContent = tickets.filter(t => t.company?.id !== currentCompanyId).length;
}

// Helper functions
function escapeHtml(str) { if (!str) return ''; return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m])); }
function formatDate(dateStr) { if (!dateStr) return ''; return new Date(dateStr).toLocaleDateString(); }
function closeDetail() { document.getElementById('detailPane').classList.remove('open'); }
function openNewTicket() { document.getElementById('modalOverlay').style.display = 'flex'; }
function closeModal() { document.getElementById('modalOverlay').style.display = 'none'; }
function logout() { localStorage.clear(); window.location.href = '/login.html'; }

// Event listeners
document.getElementById('companySelect')?.addEventListener('change', (e) => { currentCompanyId = e.target.value; loadTickets(); });
document.getElementById('searchInput')?.addEventListener('input', (e) => { /* Implement search */ });
document.querySelectorAll('.filter-chip').forEach(chip => {
    chip.addEventListener('click', () => {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        // Implement filtering
    });
});

// Initialize
loadCompanies();

// Get user info from token
try {
    const token = localStorage.getItem('xmp_access_token');
    if (token) {
        const payload = JSON.parse(atob(token.split('.')[1]));
        document.getElementById('userName').textContent = payload.given_name || payload.email?.split('@')[0] || 'User';
        document.getElementById('userAvatar').textContent = (payload.given_name || 'U')[0].toUpperCase();
    }
} catch(e) {}