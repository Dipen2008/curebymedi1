# CureByMedi — Project Guide

> Your medicine information & scan app. Built with **Node.js + Express + Mongoose** on the backend and **plain HTML / CSS / JS** on the frontend (mobile-first). No framework, no build step. Read this top → bottom; use Ctrl+F to jump around.

---

## 1. What the app does

- Search **253,000+ Indian medicines** by name or composition (seeded from a public CSV).
- View detailed info per medicine (composition, pack size, price, manufacturer, dosage / benefits / side effects / how-to-take when populated).
- **Scan a medicine photo** — AI (GPT-4o vision) reads the strip / bottle / pill, identifies the name, and matches against your DB.
- **Separate admin panel** with stats, medicine CRUD, user management, scan audit log, and CSV/JSON bulk import.
- Auth (signup / login / logout) with role-based admin gating. Mobile-first UI with sticky bottom nav.

---

## 2. Architecture & folders

```
/app
├── backend/
│   ├── server.py              ← Tiny Python proxy (Emergent platform glue + AI scan)
│   ├── requirements.txt       ← Python deps (only needed for Emergent preview)
│   ├── .env                   ← SECRETS — edit before deploy (see §5)
│   └── node/                  ← THE REAL BACKEND (all your business logic)
│       ├── server.js          ← Express entry point
│       ├── package.json
│       ├── data/              ← Cached CSV after first download
│       ├── routes/
│       │   ├── auth.js        ← /api/auth/*
│       │   ├── medicines.js   ← /api/medicines/*
│       │   ├── admin.js       ← /api/admin/*
│       │   └── scan.js        ← /api/scan (calls Python sidecar for AI)
│       ├── models/
│       │   ├── User.js
│       │   ├── Medicine.js
│       │   └── Scan.js
│       ├── middleware/auth.js ← JWT + admin guard
│       └── services/seed.js   ← Admin seed + 250k medicine CSV bulk import
├── frontend/
│   ├── server.js              ← Express static server (~15 lines)
│   ├── package.json
│   └── public/                ← 100% vanilla HTML / CSS / JS
│       ├── index.html         ← Landing
│       ├── login.html, signup.html
│       ├── dashboard.html     ← User home: search + categories + grid
│       ├── scan.html          ← Camera / upload + AI result
│       ├── admin.html         ← Admin tabs: overview, meds, users, scans, import
│       ├── css/style.css      ← Mobile-first design tokens + styles
│       └── js/{api,auth,dashboard,scan,admin}.js
├── memory/
│   ├── PRD.md
│   └── test_credentials.md
└── PROJECT_GUIDE.md           ← (this file)
```

### How requests flow

```
Browser  ── /api/* ──►  Python (port 8001)  ── proxy ──►  Node.js (port 9001)  ──►  MongoDB
                       (also serves /api/_python/scan → GPT-4o vision)

Browser  ── /*    ──►  Express static (port 3000)  ──►  /app/frontend/public/*.html
```

**When you deploy to Render / Railway / your own server, the Python layer disappears completely.** You only deploy `/app/backend/node` and `/app/frontend`.

---

## 3. Tech stack

| Layer    | Tech                                 | Where it lives          | Port |
|----------|--------------------------------------|-------------------------|------|
| Frontend | Vanilla HTML/CSS/JS + Express static | `/app/frontend`         | 3000 |
| Backend  | **Node.js + Express + Mongoose**     | `/app/backend/node`     | 9001 (internal) |
| Bridge   | FastAPI proxy (Emergent only)        | `/app/backend/server.py`| 8001 |
| Database | MongoDB                              | `mongodb://localhost`   | 27017 |
| AI       | OpenAI GPT-4o (Emergent universal key)| Python sidecar         | —    |

---

## 4. URL routes

| Path              | Page             | Visible to                  |
|-------------------|------------------|------------------------------|
| `/`               | Landing          | guests (logged-in → dashboard)|
| `/login.html`     | Login            | guests                       |
| `/signup.html`    | Signup           | guests                       |
| `/dashboard.html` | Search / browse  | any logged-in user           |
| `/scan.html`      | AI photo scan    | any logged-in user           |
| `/admin.html`     | Admin panel      | role=admin only              |

---

## 5. 🔐 Secrets — Lines to change BEFORE deploying

Open **`/app/backend/.env`**:

```env
MONGO_URL="mongodb://localhost:27017"
DB_NAME="curebymedi"
CORS_ORIGINS="*"
JWT_SECRET="b6f7d2e914a04c2bbf69d61c8a25c7a3e4f8d9c0a1b2e3f456789abcdef012345"   ← LINE 4
ADMIN_EMAIL="admin@curebymedi.com"                                              ← LINE 5
ADMIN_PASSWORD="admin123"                                                       ← LINE 6
EMERGENT_LLM_KEY="sk-emergent-***"                                              ← LINE 7  (keep)
NODE_PORT="9001"
```

### What to change
1. **Line 4 — `JWT_SECRET`** — paste a fresh 96-char random string. Generate one:
   ```bash
   python3 -c "import secrets; print(secrets.token_hex(48))"
   ```
2. **Line 5 — `ADMIN_EMAIL`** — your own email (e.g. `you@gmail.com`).
3. **Line 6 — `ADMIN_PASSWORD`** — a strong password only you know.
4. **Line 7 — `EMERGENT_LLM_KEY`** — only used inside Emergent for the AI scan; if you deploy elsewhere, swap to your own `OPENAI_API_KEY` (see §9).

### After editing
```bash
sudo supervisorctl restart backend
```
That's it. `seedAdmin()` in `node/services/seed.js` automatically updates the password hash on next startup. **You never have to touch the database directly.**

Want to invalidate every existing user's session (e.g. you suspect a leak)? Change `JWT_SECRET` and restart — all old tokens become invalid.

### Rules
- ✅ `.env` is in `.gitignore` — will NOT be pushed to GitHub.
- ❌ Never paste your password into a chat, screenshot, README, or commit.
- ❌ Never share `JWT_SECRET`.

---

## 6. Running locally (outside Emergent)

```bash
# 1. Install deps
cd /app/backend/node && yarn install
cd /app/frontend && yarn install

# 2. Start backend (port 9001) — needs MongoDB running on the URL in .env
cd /app/backend/node && node server.js

# 3. Start frontend (port 3000) in a separate terminal
cd /app/frontend && node server.js

# 4. Open http://localhost:3000  (frontend talks to backend at the same /api path
#    via a reverse proxy you configure on your host — see §9).
```

Inside Emergent the supervisor handles all 3 processes; you typically just edit code (hot reload restarts the relevant service).

---

## 7. Common edits (cheat sheet)

### Add a new medicine
- **Via UI:** log in as admin → `/admin.html` → Medicines tab → **+ Add medicine**.
- **Via CSV bulk:** Admin → Bulk import tab → pick a CSV with at least a `name` column.

### Add a new field on Medicine
1. `/app/backend/node/models/Medicine.js` — add a key to the schema (e.g. `barcode: { type: String, default: "" }`).
2. `/app/backend/node/routes/medicines.js` — add `"barcode"` to the `fields` array in `pickFields()` and to `formatMedicine()` return.
3. `/app/frontend/public/admin.html` — add `<input class="input" name="barcode" />` inside the form.
4. `/app/frontend/public/js/dashboard.js` — add `${field("Barcode", m.barcode)}` to `openMedicine()`.
5. `sudo supervisorctl restart backend`.

### Add a new category
- `/app/frontend/public/js/dashboard.js` → push the new label into the `CATEGORIES` array.
- `/app/frontend/public/admin.html` → add an `<option>` inside the category `<select>`.
- (No backend change needed — category is just a string.)

### Change brand color / fonts
`/app/frontend/public/css/style.css` → edit the CSS variables at the top of `:root`:
```css
:root {
  --brand: #2E5B55;       /* main green */
  --brand-hover: #20403B;
  --brand-soft: #E7F0EE;
}
```
Fonts use Google Fonts — first line of the file. Change `Outfit` / `Manrope` to anything you like.

### Add a new page (e.g. `/about.html`)
- Create `/app/frontend/public/about.html` (copy `index.html` as a starting point).
- Link to it from anywhere. No router needed; everything is just files.

---

## 8. Bulk import 50k+ more medicines

The system already comes seeded with 253k Indian medicines on first run. To **add more** later:

**Option A — Admin UI (recommended)**
- Go to `/admin.html` → **Bulk import** tab.
- Upload a CSV with columns: `name, manufacturer, price, type, packSize, composition, category, dosage, benefits, sideEffects, howToTake, image`.
- Only `name` is required.

**Option B — Direct DB**
```bash
mongoimport --uri "mongodb://localhost:27017" --db curebymedi --collection medicines \
  --type csv --headerline --file /path/to/new_medicines.csv
```

To re-seed from scratch (drops everything):
```bash
mongosh curebymedi --eval "db.medicines.drop()"
sudo supervisorctl restart backend       # downloads + re-imports CSV
```

---

## 9. Deploying — production-grade setup

### Recommended: Render.com (free + simple)

You will end up with **3 services**:

1. **MongoDB** — use **MongoDB Atlas** free tier. Create a cluster, get a connection string like `mongodb+srv://user:pass@cluster0.xxx.mongodb.net`.

2. **Backend (Node.js)** on Render:
   - New → Web Service → connect your GitHub repo.
   - Root directory: `backend/node`
   - Build: `yarn install`
   - Start: `node server.js`
   - Environment variables:
     ```
     MONGO_URL=<your Atlas URI>
     DB_NAME=curebymedi
     JWT_SECRET=<your fresh secret>
     ADMIN_EMAIL=<your email>
     ADMIN_PASSWORD=<your strong password>
     NODE_PORT=10000                    (Render uses this var name PORT — adjust)
     OPENAI_API_KEY=<your own openai key, see below>
     ```
   - Note the public URL (e.g. `https://curebymedi-api.onrender.com`).

3. **Frontend (Static)** on Render or Vercel or Cloudflare Pages:
   - Root directory: `frontend`
   - Build: `yarn install`
   - Start: `node server.js`
   - Add env var: nothing special, the frontend just calls same-origin `/api/*`.
   - In front of your frontend, add a **reverse-proxy rule** so that `/api/*` is forwarded to the backend URL. On Render: add a Service-level rewrite, or simply call the backend URL directly from `frontend/public/js/api.js` (change `API_BASE` to your backend URL).

### AI image scan in production
The free Emergent universal LLM key only works inside the Emergent preview. For production:
1. Get an OpenAI API key at https://platform.openai.com/api-keys.
2. Add `OPENAI_API_KEY=sk-...` to backend env.
3. Replace `/api/_python/scan` (Python) with a direct Node.js call to OpenAI using the official SDK:
   ```bash
   cd backend/node && yarn add openai
   ```
   Then in `routes/scan.js`, drop the `fetch()` to the Python sidecar and call OpenAI directly with the same prompt. Detailed code snippet inside the file's comment.

### CORS
In production, change `CORS_ORIGINS` to your real frontend URL (e.g. `https://curebymedi.com`) — not `*`.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Login says "Invalid email or password" with admin creds | Edited `.env` but didn't restart | `sudo supervisorctl restart backend` |
| `/admin.html` redirects to `/dashboard.html` while logged in | The user is not admin | Log in with `ADMIN_EMAIL` from `.env` |
| All users get logged out suddenly | `JWT_SECRET` changed | Expected — all tokens invalidate |
| Medicines list is empty | DB was cleared but backend wasn't restarted | Restart backend — the seeder runs only when collection is empty |
| Bulk import CSV fails | Required column `name` missing or empty rows | Open the CSV in a text editor and make sure the header row has `name` |
| Image scan times out / 502 | Photo too blurry / not a real image | Try a clearer JPEG/PNG, well-lit, with text visible on the strip |
| 401 spam in console on landing page | `api/auth/me` probe to check session | Normal — ignore |

---

## 11. Pre-deployment checklist ✅

- [ ] Updated `JWT_SECRET` in `backend/.env` to a fresh 96-char random hex string.
- [ ] Updated `ADMIN_EMAIL` to your real email.
- [ ] Updated `ADMIN_PASSWORD` to a strong password only you know.
- [ ] (Production only) replaced `EMERGENT_LLM_KEY` with your own `OPENAI_API_KEY` and swapped the AI call in `routes/scan.js`.
- [ ] `CORS_ORIGINS` set to your real frontend URL (not `*`) in production.
- [ ] Restarted backend (`sudo supervisorctl restart backend`) and verified you can log in with the new admin password.
- [ ] Verified `.env` is in `.gitignore` (`grep .env /app/.gitignore`).
- [ ] Took a clean test photo and confirmed `/scan.html` works end-to-end.
- [ ] (Optional) Personalized hero copy, footer year, and `/about.html` if you added one.

Tick all boxes → click **Save to GitHub** in the chat input → deploy on Render (or your host of choice) following §9.

---

🎉 **That's the whole project. Open any file in `/app/backend/node` or `/app/frontend/public` and you'll see plain Node.js or plain HTML — no React, no build tools, no magic.** Edit anything. Ship it.
