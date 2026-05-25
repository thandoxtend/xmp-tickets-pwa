# XMP Tickets - Fleet & Operations Management

[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/YOUR_USERNAME/xmp-tickets-pwa)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Security](https://img.shields.io/badge/security-AWS%20Cognito-blue)](https://aws.amazon.com/cognito/)
[![Deployed on Render](https://img.shields.io/badge/deployed%20on-Render-blue)](https://render.com)

## 🔐 Security Overview

**Your credentials are SAFE. Here's why:**

| Security Feature | Implementation |
|-----------------|----------------|
| Password Storage | NEVER stored - sent directly to AWS Cognito |
| Authentication | AWS Cognito (enterprise-grade) |
| Encryption | HTTPS + JWT tokens |
| Token Expiry | 1 hour auto-expiration |
| MFA Support | Optional multi-factor authentication |
| Session Management | Secure token-based |

**What we store:**
- ✅ Authentication token (expires in 1 hour)
- ✅ User email address
- ❌ NEVER your password
- ❌ NEVER personal sensitive data

## 🚀 Live Demo

**Deployed URL:** https://xmp-tickets-pwa.onrender.com

## ✨ Features

| Feature | Status | Security |
|---------|--------|----------|
| Secure Login | ✅ | AWS Cognito |
| MFA Support | ✅ | Optional 2FA |
| Token-based Auth | ✅ | JWT with expiry |
| Multi-Company | ✅ | Role-based |
| Ticket Management | ✅ | Permission-based |
| PWA Ready | ✅ | HTTPS required |

## 📋 Architecture
┌─────────────────────────────────────────────────────────────────────────────┐
│ SECURE AUTHENTICATION FLOW │
├─────────────────────────────────────────────────────────────────────────────┤
│ │
│ 1. User enters credentials │
│ ↓ │
│ 2. Credentials sent directly to AWS Cognito (never stored) │
│ ↓ │
│ 3. Cognito validates and returns JWT token │
│ ↓ │
│ 4. Token stored in localStorage (expires in 1 hour) │
│ ↓ │
│ 5. All API requests include token in Authorization header │
│ ↓ │
│ 6. Token automatically refreshed before expiry │
│ │
└─────────────────────────────────────────────────────────────────────────────┘

## 📥 Installation

### Prerequisites
- Node.js 18+ or Python 3.9+
- Modern browser (Chrome, Edge, Firefox, Safari)
- XMP staging credentials

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/xmp-tickets-pwa.git
cd xmp-tickets-pwa

# 2. Install dependencies
npm install

# 3. Start the server
npm start

# 4. Open browser to:
#    http://localhost:3000/login.html



📱 Install as PWA
Desktop (Chrome/Edge)
Visit the deployed URL

Click install icon in address bar

App installs as standalone window

Mobile (iOS)
Open in Safari

Tap Share → "Add to Home Screen"

Mobile (Android)
Open in Chrome

Tap ⋮ → "Install app"

🔌 API Security
Endpoint	Authentication	Method
/api/auth/login	None (credentials)	POST
/api/auth/mfa	Session token	POST
/api/companies	Bearer token	GET
/api/tickets	Bearer token	GET/POST
/api/tickets/:id/messages	Bearer token	POST
🐛 Troubleshooting
Issue: "Token expired"
Solution: Log out and log in again

Issue: "401 Unauthorized"
Solution: Token invalid - clear localStorage and re-authenticate

Issue: "CORS errors"
Solution: Use the deployed version on Render (handles CORS automatically)

Security Check: Verify no password stored
Open browser console (F12) and run:

javascript
// This should NOT show your password
console.log(localStorage.getItem('password'));  // Should be null

// This shows your token (normal)
console.log(localStorage.getItem('xmp_access_token'));  // Token exists
📁 Project Structure
text
xmp-tickets-pwa/
├── server.js          # Node.js proxy server
├── dashboard.html     # Main application
├── login.html         # Login page
├── js/
│   └── app.js        # Frontend logic
├── package.json      # Dependencies
├── render.yaml       # Deployment config
└── README.md         # Documentation