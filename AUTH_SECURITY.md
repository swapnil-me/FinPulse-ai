# FinPulse authentication and authorization

## What is implemented

- bcrypt password hashing; minimum 12 characters, maximum 72 UTF-8 bytes.
- Strict request schemas reject owner IDs, role fields and other unexpected attributes.
- Signed access JWTs (15 minutes by default) validate issuer, audience, expiry, issued-at, subject, type and session ID.
- Every protected request checks a nonexpired, nonrevoked persisted session whose user matches the JWT subject. Legacy JWTs without a session ID intentionally require signing in again after this upgrade.
- Refresh tokens use 48 random bytes plus a random session ID. Only their SHA-256 hashes enter PostgreSQL. The original is a host-only HttpOnly cookie, never JSON, localStorage or sessionStorage.
- Refresh rotation is serialized with a PostgreSQL row lock. Reuse revokes the session family, including access JWTs already issued from it. Absolute session expiry is not extended by rotation.
- Browser Origin checks protect login, registration and cookie refresh. Untrusted or missing Origins get 403. CORS allows explicit origins with credentials; it is not used as the sole CSRF defense.
- Logout, logout-all, individual session revocation and password change persist revocation. Already accepted in-flight requests may finish, but subsequent requests using revoked sessions are rejected.
- Password change requires the current password and invalidates all sessions atomically. Users sign in again afterwards.
- UI account-security controls list only the current user's sessions and support password change, individual revocation, logout and logout-all.
- On sign-out/session rejection, React remounts the workspace to clear transaction data, chat, receipts, forms and drawers. Late responses from the previous session are discarded. Concurrent refreshes share a promise and use browser Web Locks across same-origin tabs when available.

## Data isolation rules

There is no global admin access or client-selectable role in this personal-finance application. All signed-in users have owner-only access. Adding `role=admin` or another `user_id` does not grant access.

| Surface | Enforcement |
|---|---|
| Transaction list and filters | Always `Transaction.user_id == current_user.id` |
| Edit and delete | Query by both transaction ID and owner; foreign/missing IDs return 404 |
| Creation and AI logging | Owner comes from authentication, not JSON; category is resolved within that owner's categories |
| Category join | Explicit category ID **and owner ID** match |
| Database relationship | Composite FK `(category_id, user_id) → categories(id, user_id)` prevents cross-owner assignment |
| CSV/PDF | Owner-scoped query before report generation |
| Advisor | Owner-scoped last-30-day aggregates; no other user's data in AI context |
| Receipt scan | Authentication required; extraction is returned to the caller and not stored or shared |
| Sessions | List/delete scoped to current user's ID |

Financial routers require authentication at router registration in addition to resource-specific ownership checks. Future endpoints still need owner-scoped queries. These are application and relational integrity controls, not PostgreSQL row-level security: privileged database operators and a compromised server are outside the end-user isolation boundary.

## Upgrade existing installations

1. Back up PostgreSQL. Preserve the existing `SECRET_KEY`; do not rotate it casually.
2. Add the new environment variables from `.env.example`.
3. Stop API traffic during this initial security upgrade and run `alembic upgrade head` from `backend/` with the correct environment.
4. Deploy the backend and rebuild the frontend together. Existing accounts and finance records remain; everyone signs in again because old JWTs lack server-side sessions.
5. Verify signup, login, refresh, logout, password change, account switching and another-user ID attempts against the deployed PostgreSQL instance.

Migration `0002` adds sessions and ownership constraints without dropping or rewriting financial records. If historical cross-owner category links exist, the migration intentionally fails. Investigate them instead of blindly reassigning or deleting records.

## Configuration

Local-only development:

```dotenv
ENVIRONMENT=development
COOKIE_SECURE=false
COOKIE_SAMESITE=lax
CORS_ORIGINS=http://localhost:5173
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
```

Production:

```dotenv
ENVIRONMENT=production
COOKIE_SECURE=true
COOKIE_SAMESITE=lax
CORS_ORIGINS=https://finance.example.com
ACCESS_TOKEN_MINUTES=15
REFRESH_TOKEN_DAYS=7
```

Use HTTPS, a generated `SECRET_KEY`, and a same-site backend where possible (for example `api.example.com` and `finance.example.com`). If frontend/backend are truly cross-site, `COOKIE_SAMESITE=none` requires `COOKIE_SECURE=true`; browser third-party cookie restrictions may still prevent refresh. A same-site reverse proxy is preferable. Do not change SameSite to None over HTTP or allow wildcard credentialed origins. Exact Origins have no trailing slash/path.

API tools such as Postman must send `Origin: http://localhost:5173` (or your allowed production origin) for register/login/refresh and preserve the refresh cookie. Other protected requests use `Authorization: Bearer <access_token>`. Origin validation is a browser CSRF control, not an API credential.

The static hosted preview continues using labelled sample data. Real authentication runs only when `VITE_API_URL` points to the Python backend. This source change does not provision or claim a live PostgreSQL/FastAPI service.

## Test and operational boundaries

Run `pytest -q` in `backend/` and `npm run test --workspace frontend` at the root. Backend fixtures use SQLite; migrations also generate PostgreSQL SQL offline. Run PostgreSQL concurrency tests and real-browser cookie tests before deployment.

The included limiter is per-process. A multi-instance production deployment needs a trusted gateway/shared rate limiter for login, refresh and password changes; do not trust arbitrary forwarded-IP headers. Schedule cleanup of expired/revoked sessions after an appropriate audit-retention period.

Email verification, forgotten-password recovery, MFA and an audit-event pipeline are not implemented in this update. No insecure recovery shortcut, emailed plaintext password or administrator bypass is provided. Add a verified mail provider and a separate, single-use recovery flow before advertising email recovery. Web Locks are not universal; browsers without them may safely lose the session if two tabs concurrently reuse a refresh token.

Reference guidance:
- https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
