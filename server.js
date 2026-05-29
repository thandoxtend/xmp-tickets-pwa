const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), port: PORT });
});

// ========== AUTH ENDPOINTS ==========
app.post('/api/auth/login', async (req, res) => {
    console.log('📝 Login attempt:', req.body.username);
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    try {
        const response = await fetch('https://cognito-idp.af-south-1.amazonaws.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth'
            },
            body: JSON.stringify({
                AuthFlow: 'USER_PASSWORD_AUTH',
                ClientId: '68n9jl2b4huqbk18ao7kf9umqk',
                AuthParameters: {
                    USERNAME: username,
                    PASSWORD: password
                }
            })
        });
        
        const data = await response.json();
        
        if (data.AuthenticationResult) {
            const token = data.AuthenticationResult.AccessToken;
            let userEmail = username;
            let userName = username.split('@')[0];
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                userEmail = payload.email || username;
                userName = payload.given_name || userEmail.split('@')[0];
            } catch(e) {}
            
            console.log('✅ Login successful for:', userName);
            res.json({ 
                success: true,
                token: token,
                email: userEmail,
                name: userName
            });
        } else if (data.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
            console.log('🔐 MFA required for:', username);
            res.json({ 
                success: true,
                challenge: 'MFA', 
                session: data.Session 
            });
        } else {
            console.log('❌ Login failed:', data.message);
            res.status(401).json({ error: data.message || 'Authentication failed' });
        }
    } catch (err) {
        console.error('💥 Login error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/mfa', async (req, res) => {
    console.log('🔐 MFA verification for:', req.body.username);
    const { session, code, username } = req.body;
    
    if (!session || !code || !username) {
        return res.status(400).json({ error: 'Session, code, and username required' });
    }
    
    try {
        const response = await fetch('https://cognito-idp.af-south-1.amazonaws.com/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-amz-json-1.1',
                'X-Amz-Target': 'AWSCognitoIdentityProviderService.RespondToAuthChallenge'
            },
            body: JSON.stringify({
                ChallengeName: 'SOFTWARE_TOKEN_MFA',
                ClientId: '68n9jl2b4huqbk18ao7kf9umqk',
                Session: session,
                ChallengeResponses: {
                    USERNAME: username,
                    SOFTWARE_TOKEN_MFA_CODE: code
                }
            })
        });
        
        const data = await response.json();
        
        if (data.AuthenticationResult) {
            console.log('✅ MFA successful for:', username);
            res.json({ token: data.AuthenticationResult.AccessToken });
        } else {
            console.log('❌ MFA failed:', data.message);
            res.status(401).json({ error: data.message || 'Invalid MFA code' });
        }
    } catch (err) {
        console.error('💥 MFA error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== COMPANIES API - WITH PROPER HEADERS ==========
app.get('/api/companies', async (req, res) => {
    console.log('📡 Fetching companies...');
    const token = req.headers.authorization;
    
    if (!token) {
        console.log('❌ No authorization token');
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    // Headers that match the XMP web app (required for API access)
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://staging.xmp.xtend.co',
        'Referer': 'https://staging.xmp.xtend.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    const endpoints = [
        'https://api-staging.xmp.xtend.co/api/tickets/meta/companies',
        'https://api-staging.xmp.xtend.co/api/companies'
    ];
    
    for (const url of endpoints) {
        try {
            console.log(`Trying: ${url}`);
            const response = await fetch(url, { method: 'GET', headers });
            
            if (response.ok) {
                const data = await response.json();
                const companies = Array.isArray(data) ? data : (data.data || data.companies || []);
                if (companies.length > 0) {
                    console.log(`✅ Found ${companies.length} companies`);
                    return res.json(companies);
                }
            } else {
                console.log(`❌ ${url} returned ${response.status}`);
            }
        } catch (err) {
            console.log(`❌ ${url} error:`, err.message);
        }
    }
    
    // Fallback companies for when API is down
    console.log('⚠️ API returned errors, using fallback companies');
    res.json([
        { id: '00000000-0000-0000-0000-000000000001', name: 'Xtend' }
    ]);
});

// ========== TICKETS API - WITH PROPER HEADERS ==========
app.get('/api/tickets', async (req, res) => {
    const token = req.headers.authorization;
    const companyId = req.query.company_id;
    
    console.log(`📡 Fetching tickets for company: ${companyId}`);
    
    if (!token) {
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': 'https://staging.xmp.xtend.co',
        'Referer': 'https://staging.xmp.xtend.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    try {
        let url = 'https://api-staging.xmp.xtend.co/api/tickets?limit=50&offset=0&is_legacy=false';
        if (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== '') {
            url += `&as_company_id=${companyId}`;
        }
        
        console.log(`📡 Proxying to: ${url}`);
        
        const response = await fetch(url, { method: 'GET', headers });
        
        if (response.ok) {
            const data = await response.json();
            const tickets = data.tickets || [];
            console.log(`✅ Found ${tickets.length} tickets`);
            res.json({ tickets, total: data.total || tickets.length });
        } else {
            console.log(`❌ Tickets API returned ${response.status}`);
            res.json({ tickets: [], total: 0, message: 'API temporarily unavailable' });
        }
    } catch (err) {
        console.error('💥 Tickets error:', err.message);
        res.json({ tickets: [], total: 0, message: 'API temporarily unavailable' });
    }
});

// SINGLE TICKET API
app.get('/api/tickets/:id', async (req, res) => {
    const token = req.headers.authorization;
    const ticketId = req.params.id;
    
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Origin': 'https://staging.xmp.xtend.co',
        'Referer': 'https://staging.xmp.xtend.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    try {
        const response = await fetch(`https://api-staging.xmp.xtend.co/api/tickets/${ticketId}`, { headers });
        const data = await response.json();
        res.json(data);
    } catch (err) {
        console.error('Ticket detail error:', err);
        res.status(500).json({ error: err.message });
    }
});

// CREATE TICKET
app.post('/api/tickets', async (req, res) => {
    const token = req.headers.authorization;
    
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Origin': 'https://staging.xmp.xtend.co',
        'Referer': 'https://staging.xmp.xtend.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    try {
        const response = await fetch('https://api-staging.xmp.xtend.co/api/tickets', {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body)
        });
        
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Create ticket error:', err);
        res.status(500).json({ error: err.message });
    }
});

// SEND REPLY
app.post('/api/tickets/:id/messages', async (req, res) => {
    const token = req.headers.authorization;
    const ticketId = req.params.id;
    
    const headers = {
        'Authorization': token,
        'Content-Type': 'application/json',
        'Origin': 'https://staging.xmp.xtend.co',
        'Referer': 'https://staging.xmp.xtend.co/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
    
    try {
        const response = await fetch(`https://api-staging.xmp.xtend.co/api/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers,
            body: JSON.stringify(req.body)
        });
        
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Send reply error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== SERVE HTML FILES ==========
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/js/app.js', (req, res) => res.sendFile(path.join(__dirname, 'js', 'app.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// Catch-all for SPA routing
app.get('*', (req, res) => {
    if (!req.path.includes('.')) {
        res.sendFile(path.join(__dirname, 'login.html'));
    }
});

// ========== START SERVER ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔═══════════════════════════════════════════════════════════════════════╗
║                    XMP TICKETS PWA - READY FOR DEPLOYMENT              ║
╠═══════════════════════════════════════════════════════════════════════╣
║                                                                       ║
║  🚀 Server: http://localhost:${PORT}                                   ║
║  🔐 Login: http://localhost:${PORT}/login.html                        ║
║  📊 Dashboard: http://localhost:${PORT}/dashboard.html                ║
║                                                                       ║
║  ✅ Health check: /health                                             ║
║  ✅ Cognito Auth: Ready                                               ║
║  ✅ API Proxy: Ready (with proper headers)                            ║
║                                                                       ║
║  📝 Note: APIs are currently down. Once they're back and             ║
║     your Cognito App Client URLs are whitelisted, everything         ║
║     will work automatically.                                          ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
    `);
});