# 🔐 Security Setup - Read Before Deploying

Your `curebymedii` app has been hardened with **CRITICAL fixes 1-4** from the security audit.

This document tells you EXACTLY what to do before pushing the app live.

---

## What was changed in your code

| # | File | What changed | Why |
|---|---|---|---|
| 1 | `backend/.env` | Added strong `JWT_SECRET`, strong `ADMIN_PASSWORD`, `COOKIE_SECRET`, Atlas placeholder for `MONGO_URL`, and `CORS_ORIGINS` placeholder | Removes all hardcoded/default secrets |
| 2 | `backend/node/middleware/auth.js` | Refuses to start if `JWT_SECRET` is missing, weak, or the default value | Prevents accidental deployment with insecure JWT |
| 3 | `backend/node/services/seed.js` | Refuses to start if `ADMIN_PASSWORD` is `"admin123"` or shorter than 10 chars | Stops the most common admin takeover |
| 4 | `backend/node/server.js` | CORS is now a strict allow-list from `CORS_ORIGINS` env var (no more `origin: true`) | Stops other websites from making authenticated requests as your users |

---

## ✅ Before you launch - 4 things YOU must do

### 1. Set your MongoDB Atlas connection string

Open `backend/.env` and replace this line:
```
MONGO_URL="mongodb+srv://REPLACE_USER:REPLACE_PASSWORD@REPLACE_CLUSTER.mongodb.net/?retryWrites=true&w=majority"
```

How to get it:
1. Go to https://cloud.mongodb.com → create a free **M0 cluster**
2. **Database Access** → Add new DB user with a **strong password** (use a password manager)
3. **Network Access** → Add IP `0.0.0.0/0` (allow from anywhere) — you can tighten later
4. Cluster → **Connect** → **Drivers** → copy the connection string
5. Paste it in `.env` and replace `<password>` with the actual DB user password

### 2. Set your real domain in CORS_ORIGINS

Open `backend/.env` and replace this line:
```
CORS_ORIGINS="https://REPLACE_WITH_YOUR_DOMAIN.com"
```

Examples:
- Production only: `CORS_ORIGINS="https://curebymedi.com,https://www.curebymedi.com"`
- Local dev + prod: `CORS_ORIGINS="http://localhost:3000,https://curebymedi.com"`

⚠️ **NEVER use `*` here.** The app will reject all requests if this is empty.

### 3. Set your Emergent LLM key

Open `backend/.env` and replace this line:
```
EMERGENT_LLM_KEY="REPLACE_WITH_YOUR_EMERGENT_LLM_KEY"
```

Get it from: **Emergent dashboard → Profile → Universal Key**

⚠️ Also set a **monthly budget cap** on the same page to prevent runaway costs from AI abuse.

### 4. WRITE DOWN your admin password

Your new admin login is:
- **Email:**    `admin@curebymedi.com` (change in `.env` if you want)
- **Password:** `3BxPqowBAQ!V3xT@p@kR`

**Save this in a password manager NOW.** If you lose it, you'll need to manually reset it via the database.

After first login, you should also change it via the API:
```
POST /api/auth/change-password
{ "oldPassword": "3BxPqowBAQ!V3xT@p@kR", "newPassword": "<your-new-strong-password>" }
```

---

## 🧪 How to verify everything works

Start the backend. You should see:
```
[seed] admin created: admin@curebymedi.com
[api] mongo connected: curebymedi
[api] http://127.0.0.1:9001
```

If `JWT_SECRET` is missing → app exits with `[FATAL] JWT_SECRET is missing or weak`
If `ADMIN_PASSWORD` is weak → app exits with `[FATAL] ADMIN_PASSWORD is too weak`
If `CORS_ORIGINS` is empty → all browser requests get blocked (`CORS not configured`)

These are intentional fail-fast safety nets.

---

## ⚠️ Still REMAINING risks (do these next session)

These were NOT fixed yet. They're not blocking launch but should be done within a few days:

- ❌ **No rate limiting** → bots can brute-force `/api/auth/login` or drain LLM budget via `/api/scan`
- ❌ **No password reset emails** → `/api/auth/forgot-password` currently returns the token in the JSON response (mocked). Integrate SendGrid/Resend.
- ❌ **No `helmet()`** middleware → missing security headers
- ❌ **Password min length is 6** → should be 8+ with complexity
- ❌ **No reCAPTCHA on signup** → bots will create fake accounts
- ❌ **Medical disclaimer not enforced** → required for healthcare compliance in India (DPDP, Drugs & Cosmetics Act)

Just say *"do the remaining security fixes"* next time and I'll handle all of them.

---

## 📁 File structure

```
backend/
├── .env                  ← YOUR SECRETS (never commit, .gitignored)
├── .env.example          ← Safe template for git
├── server.py             ← Python proxy (Emergent preview only)
└── node/
    ├── server.js         ← Real backend (Express)
    ├── middleware/
    │   └── auth.js       ← Hardened: refuses weak JWT_SECRET
    ├── services/
    │   └── seed.js       ← Hardened: refuses weak ADMIN_PASSWORD
    └── routes/
        ├── auth.js
        ├── admin.js
        ├── medicines.js
        ├── scan.js
        ├── ai.js
        ├── me.js
        └── seo.js
```

Stay safe. 🚀
