// ========== XMP AUTH MODULE ==========
// Handles login, MFA, token management, and invite flow

const Auth = (() => {
    let loginSession = null;
    let currentUsername = null;

    // ---- TOKEN MANAGEMENT ----
    function saveToken(token, username) {
        localStorage.setItem('xmp_access_token', token);
        localStorage.setItem('xmp_token_expiry', Date.now() + 3600000);

        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const userEmail = payload.email || username;
            const userName = payload.given_name || payload.name || payload['cognito:username'] || userEmail.split('@')[0];
            const userFamilyName = payload.family_name || '';
            localStorage.setItem('xmp_user_email', userEmail);
            localStorage.setItem('xmp_user_name', userName);
            localStorage.setItem('xmp_user_full_name', (userName + ' ' + userFamilyName).trim());
        } catch (e) {
            localStorage.setItem('xmp_user_name', username.split('@')[0]);
            localStorage.setItem('xmp_user_email', username);
        }
    }

    function getToken() {
        return localStorage.getItem('xmp_access_token');
    }

    function isTokenValid() {
        const token = getToken();
        const expiry = localStorage.getItem('xmp_token_expiry');
        return token && expiry && Date.now() < parseInt(expiry);
    }

    function logout() {
        localStorage.clear();
        window.location.href = '/login.html';
    }

    // ---- LOGIN ----
    async function login(username, password) {
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (data.challenge === 'MFA') {
            loginSession = data.session;
            currentUsername = username;
            return { status: 'mfa' };
        } else if (data.token) {
            saveToken(data.token, username);
            if (document.getElementById('rememberMe')?.checked) {
                localStorage.setItem('xmp_remember_email', username);
            }
            return { status: 'success' };
        } else {
            return { status: 'error', message: data.error || 'Authentication failed' };
        }
    }

    // ---- MFA ----
    async function verifyMfa(code) {
        const response = await fetch('/api/auth/mfa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session: loginSession, code, username: currentUsername })
        });
        const data = await response.json();

        if (data.token) {
            saveToken(data.token, currentUsername);
            return { status: 'success' };
        } else {
            return { status: 'error', message: data.error || 'Invalid MFA code' };
        }
    }

    // ---- INVITE REQUEST ----
    async function requestAccess(email, name, company) {
        const response = await fetch('/api/auth/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, name, company })
        });
        const data = await response.json();
        return data;
    }

    return { login, verifyMfa, requestAccess, saveToken, getToken, isTokenValid, logout };
})();