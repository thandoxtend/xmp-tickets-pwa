# XMP Tickets — Fleet & Operations Management

[![Version](https://img.shields.io/badge/version-1.1.0-blue)](https://github.com/YOUR_USERNAME/xmp-tickets-pwa)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Security](https://img.shields.io/badge/security-AWS%20Cognito-orange)](https://aws.amazon.com/cognito/)
[![Deployed on Render](https://img.shields.io/badge/deployed%20on-Render-46e3b7)](https://render.com)

---

## 🚀 Live URL

**https://xmp-tickets-pwa.onrender.com**

---

## 📁 Project Structure

```
xmp-tickets-pwa/
├── server.js           # Express proxy server (auth + API + invite endpoint)
├── dashboard.html      # Main ticket dashboard
├── login.html          # Login + Request Access page
├── index.html          # Landing / marketing page
├── sw.js               # Service worker (PWA offline support)
├── manifest.json       # PWA manifest
├── js/
│   ├── auth.js         # Auth module (login, MFA, token, invite)
│   ├── api.js          # API module (companies, tickets, messages)
│   └── app.js          # Dashboard logic (render, stats, filters)
├── css/                # Stylesheets (if any)
├── package.json
├── render.yaml
└── README.md
```

---

## 🔐 Security

| Feature | Implementation |
|---|---|
| Password storage | **Never stored** — sent directly to AWS Cognito |
| Authentication | AWS Cognito (USER_PASSWORD_AUTH) |
| MFA | SOFTWARE_TOKEN_MFA (TOTP) |
| Session tokens | JWT, 1-hour expiry |
| API proxy | Server-side only — no keys exposed to browser |
| Route protection | Token + expiry checked on every page load |

**What lives in localStorage:**

| Key | Value | Expires |
|---|---|---|
| `xmp_access_token` | Cognito JWT | 1 hour |
| `xmp_token_expiry` | Timestamp | — |
| `xmp_user_name` | Display name | — |
| `xmp_user_email` | Email address | — |
| `xmp_remember_email` | Email (opt-in) | — |

Passwords are **never** stored anywhere.

---

## ✨ Features

- ✅ Secure login via AWS Cognito (af-south-1)
- ✅ MFA / TOTP support
- ✅ Role badge decoded from Cognito JWT (`cognito:groups`)
- ✅ Multi-company selector — all registered companies shown on login
- ✅ Tickets table with status, priority, assigned-to filtering
- ✅ Rows assigned to the current user highlighted
- ✅ Ticket detail pane with message thread + reply
- ✅ Create new ticket (Operations or Admin/HR type)
- ✅ "Request Access" invite flow for users without an account
- ✅ PWA — installable on desktop and mobile
- ✅ Deployed on Render (auto-deploy from `main`)

---

## 📦 Installation (local dev)

### Prerequisites
- Node.js 18+
- XMP Cognito credentials (staging)

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/xmp-tickets-pwa.git
cd xmp-tickets-pwa

# Install
npm install

# Run
npm start
# → http://localhost:3000
```

---

## ☁️ Deployment (Render)

Render auto-deploys from `main` using `render.yaml`.

```yaml
# render.yaml
services:
  - type: web
    name: xmp-tickets-pwa
    env: node
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: PORT
        value: 3000
      - key: ADMIN_EMAIL
        value: admin@xtend.co   # ← change this
```

**Steps:**
1. Push to `main`
2. Render detects the push and rebuilds automatically
3. Visit your Render URL to verify

---

## 🔌 API Endpoints

All endpoints proxied through `server.js` to `api-staging.xmp.xtend.co`.

| Endpoint | Auth | Method | Description |
|---|---|---|---|
| `POST /api/auth/login` | None | POST | Cognito login |
| `POST /api/auth/mfa` | Session | POST | TOTP verification |
| `POST /api/auth/invite` | None | POST | Request platform access |
| `GET /api/companies` | Bearer | GET | All companies |
| `GET /api/tickets` | Bearer | GET | Tickets (filtered by company) |
| `GET /api/tickets/:id` | Bearer | GET | Single ticket detail |
| `POST /api/tickets` | Bearer | POST | Create ticket |
| `POST /api/tickets/:id/messages` | Bearer | POST | Send reply |

---

## 📱 Install as PWA

**Desktop (Chrome / Edge)**
1. Visit the Render URL
2. Click the install icon in the address bar
3. App opens as a standalone window

**iOS (Safari)**
1. Open in Safari
2. Tap Share → "Add to Home Screen"

**Android (Chrome)**
1. Open in Chrome
2. Tap ⋮ → "Install app"

---

## 🐛 Troubleshooting

| Problem | Fix |
|---|---|
| Token expired | Log out and log in again |
| 401 Unauthorized | Clear localStorage (`localStorage.clear()` in console) and re-login |
| Companies not loading | Check browser console → Network tab → `/api/companies` response |
| CORS errors locally | Use the Render URL; CORS is handled server-side |
| Invite not sending email | Configure `ADMIN_EMAIL` env var and enable AWS SES in `server.js` |

---

## 🔧 Environment Variables (Render)

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | Defaults to 3000 |
| `ADMIN_EMAIL` | Yes | Receives access request notifications |

---

## 📄 License

MIT © Xtend Mobility Platform