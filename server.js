const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

// AUTH ENDPOINTS - These must match your login.html calls
app.post('/api/auth/login', async (req, res) => {
    console.log('📝 Login request:', req.body);
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password required' });
    }
    
    try {
        // Call Cognito
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
        console.log('✅ Cognito response:', data.AuthenticationResult ? 'Success' : data.ChallengeName || 'Error');
        
        if (data.AuthenticationResult) {
            res.json({ 
                token: data.AuthenticationResult.AccessToken,
                expiresIn: data.AuthenticationResult.ExpiresIn
            });
        } else if (data.ChallengeName === 'SOFTWARE_TOKEN_MFA') {
            res.json({ 
                challenge: 'MFA', 
                session: data.Session 
            });
        } else {
            res.status(401).json({ error: data.message || 'Authentication failed' });
        }
    } catch (err) {
        console.error('❌ Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/mfa', async (req, res) => {
    console.log('📝 MFA request:', req.body);
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
        console.error('❌ MFA error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Proxy for XMP API
app.all('/api/tickets*', async (req, res) => {
    const targetUrl = `https://api-staging.xmp.xtend.co${req.url}`;
    try {
        const fetchOptions = {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': req.headers.authorization || ''
            }
        };
        if (req.method !== 'GET' && req.body) {
            fetchOptions.body = JSON.stringify(req.body);
        }
        const response = await fetch(targetUrl, fetchOptions);
        const data = await response.json();
        res.status(response.status).json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Serve your HTML files
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
    ║  ✅ Ready for testing!                                       ║
    ║                                                              ║
    ╚══════════════════════════════════════════════════════════════╝
    `);
});