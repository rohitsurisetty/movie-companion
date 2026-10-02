# Film Companion (filmydating)

A dating app that matches people by movie taste, with **Tina**, an AI matchmaker who runs the sign-up conversation and chats or talks with users afterwards. Android-first.

| Part | Stack | Folder |
|---|---|---|
| Mobile app | Expo SDK 54 · React Native 0.81 · expo-router | `frontend/` |
| API | FastAPI · MongoDB (Motor) · Socket.IO | `backend/` |
| Admin dashboard | Vite + React | `admin/` |
| Analytics copy + photo storage | Supabase | (cloud) |

---

## 1. Run it locally

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env        # fill in at least MONGO_URL and DB_NAME
uvicorn server:socket_app --reload --port 8000
```

**App**

```bash
cd frontend
npm ci
cp .env.example .env        # EXPO_PUBLIC_BACKEND_URL=http://<your-computer-ip>:8000
npx expo start
```

Phone login works everywhere using the fixed codes in `TEST_OTP_NUMBERS`. Google Sign-In only works in a real build (APK), not in Expo Go.

**Tests** (no network or database needed)

```bash
cd backend && python -m pytest tests -q
cd frontend && npm run typecheck
```

---

## 2. Deploy the backend (Railway)

1. **Database:** create a free **MongoDB Atlas** M0 cluster. Under *Database Access* add a user. Under *Network Access* allow `0.0.0.0/0` (Railway uses changing IPs). Copy the `mongodb+srv://…` connection string.
2. **Railway:** railway.app → *New Project → Deploy from GitHub repo* → pick this repo. In the service's **Settings**, set **Root Directory** to `backend`. The included `Dockerfile` and `railway.json` (health check `/api/`) are picked up automatically.
3. **Variables:** in *Variables → Raw Editor*, paste `backend/.env.example` and fill it in. The minimum is `MONGO_URL`, `DB_NAME`, `OPENAI_API_KEY`, `TMDB_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`, `TEST_OTP_NUMBERS`.
4. **Networking → Generate Domain.** That URL (e.g. `https://film-companion-production.up.railway.app`) is your `EXPO_PUBLIC_BACKEND_URL`.

To check it works, `GET https://<your-domain>/api/` should return `{"message": "filmydating API"}`.

`render.yaml` is included if you prefer Render (New → Blueprint).

---

## 3. Build the Android APK (EAS)

The APK is built in Expo's cloud.

1. Put your backend URL (and Google web client ID, if you have one) into `frontend/eas.json` → `build.preview.env`.
2. Open a terminal in one of two ways:
   - With nothing to install: on GitHub, choose **Code → Codespaces → Create codespace**.
   - On your own computer: install Node.js 20 or newer and clone the repo.
3. Run:

```bash
cd frontend
npm ci
npx eas-cli@latest login                       # your expo.dev account
npx eas-cli@latest build -p android --profile preview
```

The first time, EAS asks to **create the project** and to **generate a new Android keystore**. Answer *Yes* to both. EAS keeps the keystore, so every later APK installs over the previous one. When the build finishes (10–20 min), you get a link and a QR code. Open it on your phone to install the APK.

For the Play Store, build with `--profile production`. It produces an `.aab`, and its version code is incremented automatically.

---

## 4. Login setup

| Method | What you need |
|---|---|
| **Test numbers** (works now) | `TEST_OTP_NUMBERS=+91XXXXXXXXXX:123456`. No SMS is sent; that code always works for that number. Also give one to Google Play review. |
| **Real SMS** | Set `SMS_PROVIDER=msg91`, plus `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID`. The template must be a DLT-approved OTP template; India's DLT registration takes a few days. Twilio is also supported. OTPs only go to `+91` numbers (`OTP_ALLOWED_COUNTRY_CODES`). |
| **Google Sign-In** | Set up in Google Cloud Console → Credentials: (1) an OAuth client of type *Web application*, whose ID goes in **both** `GOOGLE_OAUTH_CLIENT_IDS` (backend) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (eas.json); (2) an OAuth client of type *Android* with package `com.filmydating.app` and the SHA-1 shown in expo.dev → Project → Credentials. No rebuild is needed after step 2. |

Without a real SMS provider and with `APP_ENV=production`, only test numbers can log in. This is deliberate: it stops codes from silently never arriving.

---

## 5. Configuration notes

- **Demo / mock profiles.** These are on by default, as the app had them. For a public launch, set them all to `false`:
  - `MOCK_FEED_PROFILES` adds the 35 sample profiles to the feed.
  - `MOCK_BOT_REPLIES` makes those profiles reply using AI.
  - `MOCK_SEED_CHATS` adds sample "unmatched" chats to History.
- **AI model.** `LLM_MODEL_DEFAULT` and `LLM_MODEL_MATCHING` default to `gpt-4o-mini` (OpenAI). Newer reasoning models (`gpt-5.x`) also work.
- **Admin dashboard.** Set `ADMIN_USERNAME` and `ADMIN_PASSWORD_HASH`. Generate the hash with `python -c "import bcrypt;print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"`. Admin login is disabled until it is set.
- **Supabase.** Run `backend/supabase_secure_rls.sql` once in the Supabase SQL editor. It undoes the old "disable RLS / grant everything to anon" script. The backend uses the service-role key only.
- **Secrets.** A TMDB token used to be hard-coded in the source and is still in git history. Revoke it in TMDB and use a new one in `TMDB_ACCESS_TOKEN`.

---

## 6. Before submitting to Google Play

- [ ] Mock flags set to `false`, and real SMS (MSG91 + DLT) configured
- [ ] Privacy-policy URL. The Data Safety form declares location, photos, messages, voice recordings, phone number and email.
- [ ] Content rating questionnaire (dating app, 18+)
- [ ] Test-number login provided for app review
- [ ] Account deletion: in the app under Profile → Delete account (`DELETE /api/user/{id}/reset-all` removes the account and its data). Play also asks for a web link where users can request deletion.

---

## What changed in the production hardening pass

**Security**
- Every endpoint now takes the user from the login session. Before, any logged-in user could read other people's chats, send messages as them, change their profiles or delete their photos.
- Removed the endpoint that logged anyone into any account using just an email address.
- Removed the hard-coded `admin123` admin password.
- The live admin feed (Socket.IO) now requires an admin login.
- Privacy toggles are enforced on the server.
- Server-side 18+ check.
- Rate limits on SMS codes, the AI and the map/movie lookups.

**Login and AI**
- Real login: native Google Sign-In plus phone OTP through MSG91 or Twilio, with codes stored hashed and expiring.
- The Emergent-only services (`emergentintegrations` and Emergent's login proxy) are replaced with direct OpenAI and Google calls.

**Matching**
- Real users now appear in each other's feeds. Two bugs hid them: the feed served sample profiles only, and the matcher skipped any profile without a "mode" flag.
- Saved filters now actually save and are applied.
- Option values are the same across the app, Tina and the backend.

**App**
- Fixed an infinite loading spinner and a Discover screen that kept re-loading forever.
- Onboarding no longer dead-ends.
- Photos are resized before upload.
- Tina's voice call no longer starts the mic on its own and no longer hears herself.
- Chats refresh.
- Session expiry sends you back to login.
- Android back button handling.
- Proper "Log out" and "Delete account".

**Ops**
- Pruned dependencies, Dockerfile, Railway/Render config, EAS build profiles and indexes.
- The backend no longer stalls while waiting on Supabase or the voice service.
