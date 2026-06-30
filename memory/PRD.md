# CureByMedi — PRD

## Original problem statement
> "run this file" — user uploaded `curebymedii-hardened (2).zip`, a Node.js + Python + vanilla HTML/CSS/JS medicine info app with 253k seeded Indian medicines. Then asked to enhance with: (a) sponsored pharmacy slot, (b) favorites + reminders, (c) drug interaction checker, (d) public SEO medicine pages.

## Final architecture
- **Frontend** (port 3000): Vanilla HTML/CSS/JS served by Express static, mobile-first PWA.
- **Backend** (port 8001 → 9001): Python FastAPI proxy launches Node.js Express child + handles `/api/_python/scan|enrich|interactions|suggest` via emergentintegrations + GPT-4o.
- **Database**: MongoDB local, pre-seeded with 253,973 Indian medicines.
- **AI**: GPT-4o (Emergent universal key) for photo scan, enrichment, interactions, symptom suggest.

## User personas
1. Visitor — browses public SEO medicine pages (no login required).
2. Registered user — search, favorites, reminders, AI scan, interaction checker.
3. Admin — full CRUD on medicines/users, scan audit log, bulk CSV/JSON import.

## What's been implemented (2026-06-28)
### Original (already in zip)
- Auth (signup/login/logout, JWT cookie + Bearer fallback, role-gated admin)
- Search/filter 253k+ medicines + 9 categories
- AI photo scan (GPT-4o vision)
- 5-tab admin panel (overview, medicines, users, scans, bulk import)
- Lazy AI enrichment per medicine (usedFor / dosage / sideEffects / warnings)
- Public SEO pages at `/medicine/<slug>` with JSON-LD `<Drug>` schema

### Today's enhancements
- **(a)** Partner pharmacy "Buy from" widget at `/app/frontend/public/js/partners.js` — 4 sponsored buttons (Tata 1mg, PharmEasy, Apollo 24/7, Netmeds) on both dashboard modal and public medicine page. Affiliate-ready via `aff` field per partner. Proper `rel="nofollow sponsored noopener"` + Sponsored badge.
- **(b)** Favorites + Reminders end-to-end verified (heart icon on cards, `/favorites.html`, `/reminders.html` with browser-notification push when due).
- **(c)** Drug interaction checker at `/interactions.html` — multi-select up to 6 meds → GPT-4o returns riskLevel (safe/caution/avoid), pair-wise breakdown, advice.
- **(d)** SEO polish on `/medicine/:slug`: og:title / og:description / og:image (custom SVG fallback) / twitter:card / canonical link / JSON-LD. Fixed a pre-existing bug where 401 from `/enrich` was overwriting `m` with error JSON.
- **Bug fix**: `CORS_ORIGINS=*` wildcard now respected in `server.js`.

## Files of note
- `/app/backend/.env` — secrets (Mongo, JWT, admin, EMERGENT_LLM_KEY)
- `/app/backend/node/server.js` — Express entry
- `/app/backend/server.py` — Python proxy + LLM endpoints
- `/app/frontend/public/js/partners.js` — sponsored widget
- `/app/frontend/public/js/dashboard.js` — main app shell
- `/app/frontend/public/medicine.html` — public SEO page

## Prioritized backlog
### P1
- Replace placeholder affiliate URLs with real IDs (1mg, Apollo affiliate programs)
- Forgot-password email via SendGrid/Resend
- Infinite scroll on dashboard

### P2
- Hindi UI toggle (model already supports `language`)
- Prescription upload + OCR
- Public rate-limited REST API
- PWA install prompt + offline cache

## Next tasks for the user
1. Sign up to Tata 1mg/PharmEasy/Apollo affiliate programs and paste IDs into `partners.js` (`aff` field).
2. Replace `JWT_SECRET` and `ADMIN_PASSWORD` in `/app/backend/.env` before production.
3. Click "Save to GitHub" → deploy on Render with MongoDB Atlas (PROJECT_GUIDE.md §9).
