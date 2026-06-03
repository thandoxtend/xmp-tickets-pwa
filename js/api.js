// ========== XMP API MODULE ==========
// Centralised fetch wrapper for all XMP backend calls

const API = (() => {
    const BASE = '';

    function authHeaders() {
        const token = localStorage.getItem('xmp_access_token');
        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    }

    async function handleResponse(res) {
        if (res.status === 401) {
            localStorage.clear();
            window.location.href = '/login.html';
            return null;
        }
        try {
            return await res.json();
        } catch {
            return null;
        }
    }

    // ---- COMPANIES ----
    async function getCompanies() {
        try {
            const res = await fetch(`${BASE}/api/companies`, { headers: authHeaders() });
            return await handleResponse(res);
        } catch (err) {
            console.error('getCompanies error:', err);
            return [];
        }
    }

    // ---- TICKETS ----
    async function getTickets(companyId) {
        try {
            let url = `${BASE}/api/tickets?limit=50&offset=0`;
            if (companyId) url += `&company_id=${companyId}`;
            const res = await fetch(url, { headers: authHeaders() });
            const data = await handleResponse(res);
            if (!data) return [];
            return data.tickets || (Array.isArray(data) ? data : []);
        } catch (err) {
            console.error('getTickets error:', err);
            return [];
        }
    }

    async function getTicket(id) {
        try {
            const res = await fetch(`${BASE}/api/tickets/${id}`, { headers: authHeaders() });
            return await handleResponse(res);
        } catch (err) {
            console.error('getTicket error:', err);
            return null;
        }
    }

    async function createTicket(payload) {
        try {
            const res = await fetch(`${BASE}/api/tickets`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(payload)
            });
            return await handleResponse(res);
        } catch (err) {
            console.error('createTicket error:', err);
            return null;
        }
    }

    async function sendMessage(ticketId, message) {
        try {
            const res = await fetch(`${BASE}/api/tickets/${ticketId}/messages`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({ message })
            });
            return await handleResponse(res);
        } catch (err) {
            console.error('sendMessage error:', err);
            return null;
        }
    }

    return { getCompanies, getTickets, getTicket, createTicket, sendMessage };
})();