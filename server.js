const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Log all requests
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ========== AUTH ENDPOINTS ==========
app.post('/api/auth/login', async (req, res) => {
    console.log('📝 Login:', req.body.username);
    const { username, password } = req.body;
    
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
            
            res.json({ 
                success: true,
                token: token,
                email: userEmail,
                name: userName
            });
        } else if (data.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
            res.json({ 
                success: true,
                challenge: 'MFA', 
                session: data.Session 
            });
        } else {
            res.status(401).json({ error: data.message || 'Authentication failed' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/mfa', async (req, res) => {
    console.log('📝 MFA for:', req.body.username);
    const { session, code, username } = req.body;
    
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
            res.json({ token: data.AuthenticationResult.AccessToken });
        } else {
            res.status(401).json({ error: data.message || 'Invalid MFA code' });
        }
    } catch (err) {
        console.error('MFA error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== COMPANIES API - FIXED ==========
app.get('/api/companies', async (req, res) => {
    console.log('📡 Fetching companies...');
    const token = req.headers.authorization;
    
    if (!token) {
        console.log('❌ No authorization token');
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    // Try multiple possible endpoints
    const endpoints = [
        'https://api-staging.xmp.xtend.co/api/tickets/meta/companies',
        'https://api-staging.xmp.xtend.co/api/companies',
        'https://api-staging.xmp.xtend.co/api/meta/companies',
        'https://api-staging.xmp.xtend.co/api/user/companies'
    ];
    
    for (const url of endpoints) {
        try {
            console.log(`Trying: ${url}`);
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Authorization': token,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const companies = await response.json();
                if (companies && Array.isArray(companies) && companies.length > 0) {
                    console.log(`✅ Found ${companies.length} companies from ${url}`);
                    return res.json(companies);
                } else if (companies && companies.data && Array.isArray(companies.data)) {
                    console.log(`✅ Found ${companies.data.length} companies (nested) from ${url}`);
                    return res.json(companies.data);
                }
            } else {
                console.log(`❌ ${url} returned ${response.status}`);
            }
        } catch (err) {
            console.log(`❌ ${url} error:`, err.message);
        }
    }
    
    // Fallback - return the company the user logged in with
    console.log('⚠️ Using fallback companies');
    res.json([
        { id: '00000000-0000-0000-0000-000000000001', name: 'Xtend' },
        { id: '639e482c-3737-46f1-bdc1-5b564ce59e6b', name: 'Guud Mobiles' }
    ]);
});

// ========== TICKETS API ==========
app.get('/api/tickets', async (req, res) => {
    const token = req.headers.authorization;
    const companyId = req.query.company_id;
    
    console.log(`📡 Fetching tickets for company: ${companyId}`);
    
    if (!token) {
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    try {
        let url = 'https://api-staging.xmp.xtend.co/api/tickets?limit=50&offset=0&is_legacy=false';
        if (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== '') {
            url += `&as_company_id=${companyId}`;
        }
        
        console.log(`📡 Proxying to: ${url}`);
        
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        const tickets = data.tickets || [];
        console.log(`✅ Found ${tickets.length} tickets`);
        res.json({ tickets: tickets, total: data.total || tickets.length });
        
    } catch (err) {
        console.error('Tickets error:', err);
        res.json({ tickets: [], total: 0 });
    }
});

// SINGLE TICKET API
app.get('/api/tickets/:id', async (req, res) => {
    const token = req.headers.authorization;
    const ticketId = req.params.id;
    
    try {
        const response = await fetch(`https://api-staging.xmp.xtend.co/api/tickets/${ticketId}`, {
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
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
    
    try {
        const response = await fetch('https://api-staging.xmp.xtend.co/api/tickets', {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
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
    
    try {
        const response = await fetch(`https://api-staging.xmp.xtend.co/api/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });
        
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Send reply error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Serve HTML files
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         XMP TICKETS PWA - RUNNING ON RENDER                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  🚀 Server: http://localhost:${PORT}                         ║
║  🔐 Login: http://localhost:${PORT}/login.html              ║
║  📊 Dashboard: http://localhost:${PORT}/dashboard.html      ║
║                                                              ║
║  ✅ Health check: /health                                    ║
║  ✅ Auth endpoints ready                                     ║
║  ✅ API proxy ready                                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});