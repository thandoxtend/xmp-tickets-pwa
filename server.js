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

// AUTH ENDPOINTS
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
            // Decode token to get user info
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

// COMPANIES API - Fixed endpoint
app.get('/api/companies', async (req, res) => {
    console.log('📡 Fetching companies...');
    const token = req.headers.authorization;
    
    if (!token) {
        console.log('❌ No authorization token');
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    try {
        // Correct endpoint from your working curl command
        const response = await fetch('https://api-staging.xmp.xtend.co/api/tickets/meta/companies', {
            method: 'GET',
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            throw new Error(`API returned ${response.status}`);
        }
        
        const companies = await response.json();
        console.log(`✅ Found ${companies.length} companies`);
        
        // Send companies array directly
        res.json(companies);
        
    } catch (err) {
        console.error('Companies error:', err);
        // Return fallback companies for demo
        res.json([
            { id: '00000000-0000-0000-0000-000000000001', name: 'Xtend' },
            { id: '639e482c-3737-46f1-bdc1-5b564ce59e6b', name: 'Guud Mobiles' },
            { id: '4459e2b4-73ad-44a9-882b-41dd4e278bee', name: 'MSS 24' },
            { id: '721adf26-c618-4923-905f-549febbf08c5', name: 'Guud Drivers' },
            { id: '2baac9c0-6920-47ed-a019-3dec9fbc3185', name: 'Xtend Mobility SA' }
        ]);
    }
});

// TICKETS API
app.get('/api/tickets', async (req, res) => {
    const token = req.headers.authorization;
    const companyId = req.query.company_id;
    
    console.log(`📡 Fetching tickets for company: ${companyId}`);
    
    if (!token) {
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    try {
        let url = 'https://api-staging.xmp.xtend.co/api/tickets?limit=50&offset=0&is_legacy=false';
        if (companyId && companyId !== 'null' && companyId !== 'undefined') {
            url += `&as_company_id=${companyId}`;
        }
        
        const response = await fetch(url, {
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        const tickets = data.tickets || [];
        console.log(`✅ Found ${tickets.length} tickets`);
        res.json({ tickets: tickets, total: data.total });
        
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

app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         XMP TICKETS PWA - RUNNING                            ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  🚀 Server: http://localhost:${PORT}                         ║
║  🔐 Login: http://localhost:${PORT}/login.html              ║
║                                                              ║
║  ✅ API Ready:                                              ║
║     GET  /api/companies                                     ║
║     GET  /api/tickets                                       ║
║     POST /api/tickets                                       ║
║     POST /api/tickets/:id/messages                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});

// Add this to your server.js
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});