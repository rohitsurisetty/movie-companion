# Test Credentials

## Auth (Email OTP)

For manual or automated testing in this dev environment:

1. POST `/api/auth/send-email-otp` with `{ "email": "<any-email>" }` —
   the response includes `"otp": "<6 digits>"` and `"dev_mode": true`
   ONLY because `INSECURE_DEV_AUTH=true` is set in `/app/backend/.env`.
2. POST `/api/auth/verify-otp` with
   `{ "identifier": "<email>", "type": "email", "otp": "<6 digits>", "name": "<any>" }`
   to receive `{ session_token, user_id, ... }`.
3. Pass the `session_token` either:
   - As `Authorization: Bearer <token>` header (default for fetch)
   - As `?session_token=<token>` query param (only for `<audio src>` URLs)
   - Or as the `session_token` cookie (set automatically by verify-otp)

## Universal test OTP

`123456` is accepted as a valid OTP for ANY account — but ONLY when
`INSECURE_DEV_AUTH=true` is set. Default production deploys reject it.

## Test user

`testuser@example.com` — recreate via the flow above as needed.

## Admin auth (for /admin/* endpoints)

POST `/api/admin/login` with admin credentials → returns an `admin_token`.
Send subsequent admin requests with `Authorization: Bearer <admin_token>`.

## ⚠️ Before publishing to APK / production

1. Set `INSECURE_DEV_AUTH=false` (or remove the line) in `backend/.env`.
2. Replace the default admin password (`admin123`) with a real env-driven
   secret.
3. Lock `ALLOWED_ORIGINS` to your production domain only.
