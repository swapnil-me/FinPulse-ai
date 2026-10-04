# FinPulse AI

A learning-focused, full-stack personal finance application with a React/Vite/TypeScript frontend and a FastAPI/PostgreSQL backend. The purple dashboard includes transaction management, monthly analytics, Gemini integrations, and reports.

## Two ways to run

**Hosted preview:** uses explicitly labelled fictional data. Quick Log, edits, deletion, filters, charts, month selection, and CSV exports work on temporary sample state. Reload resets this state. Natural-language logging, vision, real accounts and PDF generation require the backend. Sample advisor responses are deterministic calculations, not Gemini responses.

**Full application:** uses PostgreSQL as the authoritative store; there is no browser-storage replacement for financial records. A separately deployed Python service is required because Sites' static/Worker hosting cannot run this FastAPI/PostgreSQL stack.

## Quick start

Requirements: Docker Compose, Node.js 20.19+ (or 22.12+), npm; Python 3.11+ if running without Docker.

1. Copy `.env.example` to `.env` in the root.
2. Generate a secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"` and replace `SECRET_KEY`.
3. Set `POSTGRES_PASSWORD` and use the same password in `DATABASE_URL` (URL-encode special characters). Docker uses hostname `db`.
4. Add a Gemini API key to the root `.env`. Keys are server-only; never prefix secrets with `VITE_`.
5. Start PostgreSQL and FastAPI:

   ```bash
   docker compose up --build -d
   ```

6. Copy `frontend/.env.example` to `frontend/.env`. Keep `VITE_API_URL=http://localhost:8000` for local development.
7. In the project root:

   ```bash
   npm ci
   npm run dev
   ```

8. Open `http://localhost:5173`, register, then add income and expenses. API documentation: `http://localhost:8000/docs`.

`docker compose down` stops services without deleting the database volume. Do not use `down -v` unless you intend to delete data.

The backend container runs `alembic upgrade head` before starting Uvicorn. In a multi-replica production system, run migrations in a dedicated release job instead.

### Backend without Docker

Create a PostgreSQL database and set `DATABASE_URL` to its host. Install the requirements in a virtual environment. From `backend/`, provide environment variables or a `backend/.env`, then run:

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

### Production frontend

Set `frontend/.env` with the HTTPS backend URL, set backend `CORS_ORIGINS` to the frontend origin, then `npm run build`. Vite outputs the site to root `dist/`. Environment changes require rebuilding the frontend. Serve it behind HTTPS. Access JWTs stay in memory and expire after 15 minutes by default. A rotating HttpOnly refresh cookie restores the session for up to 7 days; every access JWT is checked against a persisted, revocable session. See `AUTH_SECURITY.md` for production cookie/origin configuration and the migration steps.

## File structure

```text
backend/
  app/
    config.py                 Validated environment settings
    database.py               ORM Base, engine, session lifecycle
    models.py                 User → Category / Transaction relationships
    schemas.py                Pydantic request/response contracts
    security.py               bcrypt, JWT and user dependency
    main.py                   FastAPI, CORS, errors and basic rate limiting
    routers/
      auth.py                 Register, login, current user
      transactions.py         User-scoped CRUD and filters
      ai.py                   Expense logging, receipt review, advice
      reports.py              CSV and paginated PDF generation
    services/
      transactions.py         Shared atomic persistence logic
      gemini.py               Async structured Gemini requests
  alembic/                    Versioned PostgreSQL schema
  tests/test_api.py           Security and workflow integration tests
  Dockerfile
  requirements.txt
frontend/
  src/
    main.tsx                  AntD dark theme tokens
    App.tsx                   Dashboard, forms, reports and chat
    api.ts                    Typed API client and in-memory token
    types.ts                  Shared TypeScript payload contracts
    demo.ts                   Clearly separated fictional preview data
    components/               Typed stat cards and analytics charts
    utils/money.ts            Shared INR display formatting
    styles.css                Responsive violet theme + Tailwind
  public/favicon.svg
  package.json
  .env.example
docker-compose.yml
.env.example
LEARNING_GUIDE.md
```

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Account and default category creation |
| POST | `/auth/login` | Expiring bearer JWT |
| GET | `/auth/me` | Current user |
| POST | `/auth/refresh` | Rotate HttpOnly refresh token and issue access JWT |
| POST | `/auth/logout` / `/auth/logout-all` | Revoke current/all sessions |
| POST | `/auth/change-password` | Verify current password, change password and revoke sessions |
| GET / DELETE | `/auth/sessions` / `/auth/sessions/{id}` | List/revoke only the user's sessions |
| GET | `/transactions` | Date/category/payment filters; offset/limit pagination |
| POST | `/transactions` | Create income or expense |
| PUT / DELETE | `/transactions/{id}` | Owner-only modification |
| POST | `/ai/log` | Structured expense extraction and creation |
| POST | `/ai/receipt` | Image extraction, no automatic persistence |
| POST | `/ai/advice` | Advice using last 30 days of category aggregates |
| GET | `/reports?month=YYYY-MM&format=csv` | Monthly expense CSV (or `format=pdf`) |

## Accounting rules

- Single currency: INR. Amounts are positive Decimal values; kind determines income/expense.
- Balance = recorded income minus expenses through the selected month, not a connected bank balance.
- Monthly statistics use transaction dates. Savings rate = (income − expenses) / income × 100; shown as unavailable with no income.
- The chart is cumulative within the month. Date filtering operates inside the selected month.
- Receipt total may differ from item sum because of tax, discounts and rounding; all extracted values are reviewed before saving.
- Natural-language logging auto-creates expenses as requested; it does not infer income.
- No bank account linking, recurring billing, multi-currency conversion or investment execution is implied.

## AI setup and privacy

The REST adapter uses Gemini structured JSON output plus independent Pydantic validation. `GEMINI_MODEL` defaults to the requested `gemini-2.5-flash`; model availability depends on your Google account and can change, so configure a supported structured-output/vision model when necessary. Reference: https://ai.google.dev/gemini-api/docs/structured-output

Text entered in the AI logger, receipt images, and advisor questions are sent to Google. Advice includes only category/kind totals from the last 30 days: no name, email, transaction notes or payment identifiers. Images are validated and discarded after extraction. No API keys enter the browser. Requests have bounded timeouts and safe upstream error messages; ambiguous or failed output never silently falls back to invented transactions.

## Verification

Run frontend session tests with `npm run test --workspace frontend`.

```bash
npm run build
cd backend
pytest -q
```

Tests cover register/login, expired JWTs, cross-account isolation, CRUD, filters, amount validation, formula-safe CSV, PDF generation, mocked structured AI logging, minimized advice context, and receipt review. Tests use SQLite for a fast local fixture; PostgreSQL migration/runtime verification remains a deployment gate. Live Gemini calls require your API key and are not part of the tests.

## Production readiness boundary

This is an implemented foundation with defensive controls and teaching comments, not a security-certified financial service. Before handling real financial data at enterprise scale, add a shared gateway/Redis rate limiter, verified email and recovery, optional MFA, encrypted backups and restore testing, structured audit events, monitoring, request-body limits at ingress, a secrets manager, dependency/security scanning, and load tests. The included limiter is per-process and its client-IP behavior must be configured for your trusted proxy. Logout and password changes revoke persisted sessions; existing JWTs from those sessions are rejected on subsequent requests. No production data or secrets are bundled.
