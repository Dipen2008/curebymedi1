# 🚀 CureByMedi — Launch Guide (do this yourself, do NOT share secrets with anyone)

This is the ONE document you need to take CureByMedi from preview → live on the internet.
**Don't share any password, JWT secret, or Atlas connection string in chat, email, screenshots, or commits.**

---

## Part 1 — Set up MongoDB Atlas (free, 15 minutes)

You need a cloud database because the local MongoDB inside Emergent disappears when you deploy.

### 1.1 Create the account
1. Go to **https://www.mongodb.com/cloud/atlas/register** → sign up (email or Google).
2. Once in, click **"+ Create"** → pick the **FREE M0** tier.
3. Choose any provider (AWS is default). Pick a region **closest to your users** (e.g. *Mumbai (ap-south-1)* for India).
4. Cluster name: `curebymedi` (anything is fine). Click **Create**.

### 1.2 Create a database user
1. Atlas asks "How would you like to authenticate your connection?" → choose **Username and Password**.
2. Username: `curebymedi_app`
3. Password: click **Autogenerate Secure Password** → **copy it into a password manager NOW**. You'll only see it once.
4. Click **Create User**.

### 1.3 Allow network access
1. Atlas asks "Where would you like to connect from?" → click **Add a different IP address**.
2. Enter `0.0.0.0/0` (allow from anywhere — required because your host's IP can change).
3. Click **Add Entry** → **Finish and Close**.

### 1.4 Get the connection string
1. In the left sidebar click **Database** → on your cluster click **Connect**.
2. Choose **Drivers** → Node.js, version 6.7 or later.
3. You'll see a string like:
   ```
   mongodb+srv://curebymedi_app:<password>@curebymedi.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
4. **Replace `<password>` with the password from step 1.2** (URL-encode any special chars — easiest: use only letters+digits in the password).
5. Save this whole string in your password manager. We'll call it your **ATLAS_URI**.

### 1.5 First connect test (optional but recommended)
On your local laptop with `mongosh` installed:
```bash
mongosh "<your ATLAS_URI>"
```
You should land in a `>` prompt with no errors. Type `exit`.

---

## Part 2 — Rotate ALL your secrets (do this in private)

**Never paste these values into any AI chat, screenshot, or commit.** Open `/app/backend/.env` in the file explorer.

### 2.1 Generate a fresh JWT secret
Open a terminal (Emergent's bash, your laptop, or any online tool you trust) and run:
```bash
python3 -c "import secrets; print(secrets.token_hex(48))"
```
Copy the 96-character output. We'll call this **NEW_JWT_SECRET**.

### 2.2 Pick a strong admin password
A good password is **≥ 14 chars** and mixes letters + digits + symbols. Examples (do NOT reuse these — invent your own):
- `Rahul!Pharma#Boss-2026`
- `Cure$ByMedi-Mumbai-2026!`
- `bL7@xQpZ3vK9!FmR2t`

Save it in your password manager. We'll call this **NEW_ADMIN_PASSWORD**.

### 2.3 Replace the values in `.env`
Open `/app/backend/.env` and change exactly these lines (leave everything else alone):

```env
MONGO_URL="<paste your ATLAS_URI from step 1.4>"
DB_NAME="curebymedi"
CORS_ORIGINS="https://<your-public-frontend-url>"
JWT_SECRET="<paste NEW_JWT_SECRET from step 2.1>"
ADMIN_EMAIL="<your real email>"
ADMIN_PASSWORD="<paste NEW_ADMIN_PASSWORD from step 2.2>"
EMERGENT_LLM_KEY="sk-emergent-..."   # leave as-is if deploying inside Emergent
NODE_PORT="9001"
```

> Don't know your public frontend URL yet? Use `*` temporarily and change after deploy. **Change it before going to real traffic.**

### 2.4 Apply the changes
```bash
sudo supervisorctl restart backend
```
Wait ~15 seconds. The `seedAdmin()` step automatically re-hashes the new password into Mongo. You never touch the DB.

### 2.5 Verify (in private)
```bash
curl -s -X POST http://localhost:8001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<your admin email>","password":"<your new password>"}'
```
You should get back `{"token": "...", "user": {...}}`. If you see `"Invalid email or password"`, double-check the .env file for typos and restart again.

### 2.6 Rotation later (any time)
Whenever you suspect a leak OR every 6 months:
1. Generate a new JWT secret (step 2.1).
2. Paste into `.env`.
3. `sudo supervisorctl restart backend`.
   → Every existing session is invalidated. Everyone has to log in again. That's the *correct* behaviour.

---

## Part 3 — Final pre-launch checklist

- [ ] Atlas cluster created, IP `0.0.0.0/0` allowed, user created, connection string saved.
- [ ] `/app/backend/.env` updated with **all 4** rotated values (`MONGO_URL`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- [ ] `sudo supervisorctl restart backend` finished without errors (`tail -n 50 /var/log/supervisor/backend.out.log`).
- [ ] Login with the new admin password works.
- [ ] After deploy, change `CORS_ORIGINS` to your real frontend URL (not `*`).
- [ ] (Production outside Emergent) Replace `EMERGENT_LLM_KEY` with your own `OPENAI_API_KEY` — see `PROJECT_GUIDE.md` §9.
- [ ] Paste your real affiliate IDs in `/app/frontend/public/js/partners.js` (`aff` field on each partner).

---

## Part 4 — Deploy options (pick one)

### A. Emergent Native Deploy *(easiest)*
1. In the Emergent UI click the **Deploy** button.
2. It costs ~50 credits/month, gives you a `*.emergent.host` URL, supports custom domains.
3. Your Node + Python + frontend all deploy together. Atlas connection picks up `MONGO_URL` from `.env`.

### B. Render + MongoDB Atlas *(free / cheap)*
Follow `PROJECT_GUIDE.md` §9 step-by-step. Backend on Render Web Service (`backend/node`), frontend on Render Static, MongoDB on Atlas.

### C. Railway *(easiest non-Emergent)*
1. Sign up at railway.app → New Project → Deploy from GitHub.
2. Add 2 services: one for `backend/node`, one for `frontend`.
3. Add env vars on the backend service (everything from `.env`).

---

## Part 5 — One golden rule

🔒 **Anything in `/app/backend/.env` is sacred.** Never:
- Paste it in chat (AI or human)
- Screenshot it
- Commit it to GitHub (it's already in `.gitignore`, leave it that way)
- Email it to yourself in plain text

If something feels leaked, follow step 2.6 immediately.

Good luck launching 🚀
