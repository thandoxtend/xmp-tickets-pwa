const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// Log all requests for debugging
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ========== AUTH ENDPOINTS ==========

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    console.log('📝 Login request received:', req.body.username);
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    try {
        // Call AWS Cognito
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
        console.log('Cognito response:', data.AuthenticationResult ? 'Success' : (data.ChallengeName || 'Error'));
        
        if (data.AuthenticationResult) {
            // Decode token to get user info
            const token = data.AuthenticationResult.AccessToken;
            let userEmail = username;
            let userName = username.split('@')[0];
            let userCompanyId = null;
            
            try {
                const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                userEmail = payload.email || username;
                userName = payload.given_name || userEmail.split('@')[0];
                userCompanyId = payload.company_id || null;
                console.log('User decoded:', { userName, userEmail, userCompanyId });
            } catch(e) {
                console.log('Could not decode token');
            }
            
            res.json({ 
                success: true,
                token: token,
                email: userEmail,
                name: userName,
                companyId: userCompanyId
            });
        } else if (data.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
            res.json({ 
                success: true,
                challenge: 'MFA', 
                session: data.Session 
            });
        } else {
            console.log('Login failed:', data.message || 'Authentication failed');
            res.status(401).json({ error: data.message || 'Authentication failed' });
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// MFA verification endpoint
app.post('/api/auth/mfa', async (req, res) => {
    console.log('📝 MFA request for:', req.body.username);
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
            res.json({ token: data.AuthenticationResult.AccessToken });
        } else {
            console.log('MFA failed:', data.message);
            res.status(401).json({ error: data.message || 'Invalid MFA code' });
        }
    } catch (err) {
        console.error('MFA error:', err);
        res.status(500).json({ error: err.message });
    }
});

// ========== COMPANIES API ==========
app.get('/api/companies', async (req, res) => {
    console.log('📡 Fetching companies...');
    const token = req.headers.authorization;
    
    if (!token) {
        return res.status(401).json({ error: 'No authorization token' });
    }
    
    try {
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
        res.json(companies);
        
    } catch (err) {
        console.error('Companies error:', err);
        res.json([]);
    }
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

// Single ticket endpoint
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

// Create ticket endpoint
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

// Send message endpoint
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
        console.error('Send message error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Serve HTML files
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║         XMP TICKETS PWA - RUNNING ON RENDER                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  🚀 Server: http://localhost:${PORT}                         ║
║  🔐 Login: http://localhost:${PORT}/login.html              ║
║                                                              ║
║  ✅ Auth endpoints ready                                     ║
║  ✅ API proxy ready                                          ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    `);
});