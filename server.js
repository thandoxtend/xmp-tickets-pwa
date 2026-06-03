const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Admin email that receives access requests
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@xtend.co';
const XMP_API = 'https://api-staging.xmp.xtend.co';
const XMP_ORIGIN = 'https://staging.xmp.xtend.co';

app.use(express.json());
app.use(express.static(__dirname));

app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString(), port: PORT });
});

// ========== SHARED PROXY HEADERS ==========
function xmpHeaders(authToken) {
    return {
        'Authorization': authToken,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Origin': XMP_ORIGIN,
        'Referer': XMP_ORIGIN + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };
}

// ========== AUTH: LOGIN ==========
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }

    console.log('📝 Login attempt:', username);

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
                AuthParameters: { USERNAME: username, PASSWORD: password }
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
            } catch (e) {}

            console.log('✅ Login successful:', userName);
            return res.json({ success: true, token, email: userEmail, name: userName });

        } else if (data.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
            console.log('🔐 MFA required:', username);
            return res.json({ success: true, challenge: 'MFA', session: data.Session });

        } else {
            const errMsg = data.message || data.__type || 'Authentication failed';
            console.log('❌ Login failed:', errMsg);
            return res.status(401).json({ error: errMsg });
        }
    } catch (err) {
        console.error('💥 Login error:', err.message);
        res.status(500).json({ error: 'Login service unavailable. Please try again.' });
    }
});

// ========== AUTH: MFA ==========
app.post('/api/auth/mfa', async (req, res) => {
    const { session, code, username } = req.body;
    if (!session || !code || !username) {
        return res.status(400).json({ error: 'Session, code, and username required' });
    }

    console.log('🔐 MFA verification:', username);

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
                ChallengeResponses: { USERNAME: username, SOFTWARE_TOKEN_MFA_CODE: code }
            })
        });

        const data = await response.json();

        if (data.AuthenticationResult) {
            console.log('✅ MFA successful:', username);
            return res.json({ token: data.AuthenticationResult.AccessToken });
        } else {
            console.log('❌ MFA failed:', data.message);
            return res.status(401).json({ error: data.message || 'Invalid MFA code' });
        }
    } catch (err) {
        console.error('💥 MFA error:', err.message);
        res.status(500).json({ error: 'MFA verification unavailable. Please try again.' });
    }
});

// ========== AUTH: INVITE / REQUEST ACCESS ==========
app.post('/api/auth/invite', async (req, res) => {
    const { email, name, company } = req.body;

    if (!email || !name || !company) {
        return res.status(400).json({ error: 'Name, email, and company are required' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email address' });
    }

    console.log(`📨 Access request from: ${name} <${email}> @ ${company}`);

    // -------------------------------------------------------
    // Option A: Send via SES / SMTP (uncomment when configured)
    // -------------------------------------------------------
    // const ses = new AWS.SES({ region: 'af-south-1' });
    // await ses.sendEmail({
    //   Source: 'noreply@xtend.co',
    //   Destination: { ToAddresses: [ADMIN_EMAIL] },
    //   Message: {
    //     Subject: { Data: `XMP Access Request: ${name} (${company})` },
    //     Body: {
    //       Html: { Data: `
    //         <h2>New XMP Platform Access Request</h2>
    //         <p><strong>Name:</strong> ${name}</p>
    //         <p><strong>Email:</strong> ${email}</p>
    //         <p><strong>Company:</strong> ${company}</p>
    //         <p>Log in to AWS Cognito to create their account, then send them an invitation.</p>
    //       `}
    //     }
    //   }
    // }).promise();
    // -------------------------------------------------------

    // Option B: Log the request + store it (always runs)
    // In production, swap the above comment block in.
    const requestRecord = {
        timestamp: new Date().toISOString(),
        name,
        email,
        company,
        status: 'pending'
    };

    console.log('📋 Access request logged:', JSON.stringify(requestRecord));

    // Respond success so the front-end can show confirmation
    return res.json({
        success: true,
        message: `Access request received for ${name}. An admin will create your XMP account and send an invitation to ${email}.`
    });
});

// ========== COMPANIES ==========
app.get('/api/companies', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'No authorization token' });

    console.log('📡 Fetching companies...');

    const endpoints = [
        `${XMP_API}/api/tickets/meta/companies`,
        `${XMP_API}/api/companies`
    ];

    for (const url of endpoints) {
        try {
            console.log('Trying:', url);
            const response = await fetch(url, { method: 'GET', headers: xmpHeaders(token) });

            if (response.ok) {
                const data = await response.json();
                const companies = Array.isArray(data) ? data : (data.data || data.companies || []);
                if (companies.length > 0) {
                    console.log(`✅ Found ${companies.length} companies from ${url}`);
                    return res.json(companies);
                }
            } else {
                const text = await response.text().catch(() => '');
                console.log(`❌ ${url} → ${response.status}`, text.slice(0, 200));
            }
        } catch (err) {
            console.log(`❌ ${url} error:`, err.message);
        }
    }

    // Fallback so the UI doesn't break
    console.log('⚠️ Using fallback company list');
    res.json([
        { id: '00000000-0000-0000-0000-000000000001', name: 'Xtend' }
    ]);
});

// ========== TICKETS ==========
app.get('/api/tickets', async (req, res) => {
    const token = req.headers.authorization;
    const companyId = req.query.company_id;
    if (!token) return res.status(401).json({ error: 'No authorization token' });

    console.log(`📡 Fetching tickets — company: ${companyId || 'all'}`);

    try {
        let url = `${XMP_API}/api/tickets?limit=50&offset=0&is_legacy=false`;
        if (companyId && companyId !== 'null' && companyId !== 'undefined' && companyId !== '') {
            url += `&as_company_id=${companyId}`;
        }

        console.log('Proxying to:', url);
        const response = await fetch(url, { method: 'GET', headers: xmpHeaders(token) });

        if (response.ok) {
            const data = await response.json();
            const tickets = data.tickets || (Array.isArray(data) ? data : []);
            console.log(`✅ Found ${tickets.length} tickets`);
            return res.json({ tickets, total: data.total || tickets.length });
        } else {
            const text = await response.text().catch(() => '');
            console.log(`❌ Tickets API ${response.status}:`, text.slice(0, 300));
            return res.json({ tickets: [], total: 0, message: `API error ${response.status}` });
        }
    } catch (err) {
        console.error('💥 Tickets error:', err.message);
        res.json({ tickets: [], total: 0, message: 'API unavailable' });
    }
});

// ========== SINGLE TICKET ==========
app.get('/api/tickets/:id', async (req, res) => {
    const token = req.headers.authorization;
    const ticketId = req.params.id;
    if (!token) return res.status(401).json({ error: 'No authorization token' });

    try {
        const response = await fetch(`${XMP_API}/api/tickets/${ticketId}`, {
            headers: xmpHeaders(token)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Ticket detail error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== CREATE TICKET ==========
app.post('/api/tickets', async (req, res) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: 'No authorization token' });

    try {
        const response = await fetch(`${XMP_API}/api/tickets`, {
            method: 'POST',
            headers: xmpHeaders(token),
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Create ticket error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== TICKET MESSAGES ==========
app.post('/api/tickets/:id/messages', async (req, res) => {
    const token = req.headers.authorization;
    const ticketId = req.params.id;
    if (!token) return res.status(401).json({ error: 'No authorization token' });

    try {
        const response = await fetch(`${XMP_API}/api/tickets/${ticketId}/messages`, {
            method: 'POST',
            headers: xmpHeaders(token),
            body: JSON.stringify(req.body)
        });
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        console.error('Send reply error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ========== SERVE STATIC FILES ==========
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/dashboard.html', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/js/app.js', (req, res) => res.sendFile(path.join(__dirname, 'js', 'app.js')));
app.get('/js/auth.js', (req, res) => res.sendFile(path.join(__dirname, 'js', 'auth.js')));
app.get('/js/api.js', (req, res) => res.sendFile(path.join(__dirname, 'js', 'api.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'manifest.json')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('*', (req, res) => {
    if (!req.path.includes('.')) res.sendFile(path.join(__dirname, 'login.html'));
});

// ========== START ==========
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║            XMP TICKETS PWA — SERVER READY            ║
╠══════════════════════════════════════════════════════╣
║  🚀 http://localhost:${PORT}                          
║  🔐 Login:     /login.html                          
║  📊 Dashboard: /dashboard.html                      
║                                                      
║  ✅ Cognito Auth (login + MFA)                      
║  ✅ Invite / Request Access endpoint                
║  ✅ Companies & Tickets proxy                       
║                                                      
║  📧 Access requests logged to console.              
║     Set ADMIN_EMAIL + configure SES to email them.  
╚══════════════════════════════════════════════════════╝
    `);
});