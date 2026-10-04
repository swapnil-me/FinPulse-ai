# Read the code in this order

## 1. Python classes, inheritance, and validation

Start with `backend/app/schemas.py`. `BaseModel` is Pydantic's parent class. Inheriting gives each schema validation, JSON parsing, and serialization. Type hints such as `date`, `Decimal`, `Literal`, and `list[ReceiptItem]` express the shape of valid input; `Field` adds limits. `Optional[str]` means `str | None`, not an automatically optional argument unless a default is supplied.

In `models.py`, classes inherit from SQLAlchemy's `Base`, which is completely separate from Pydantic's `BaseModel`. ORM models describe database tables and relationships; schemas describe API boundaries. Keeping them separate prevents accidentally returning password hashes.

`User.transactions` is one-to-many. Each `Transaction.user_id` is the foreign key, and `Transaction.user` navigates back to its owner. `back_populates` pairs the two Python attributes. Categories are scoped to a user; the shared persistence service resolves a category using the authenticated owner.

## 2. Dependency injection and resource lifetime

Read `database.py` and `security.py`. FastAPI resolves `Depends(get_db)` and `Depends(get_current_user)` before calling a route. The same database dependency is cached within a request. A `yield` dependency keeps the session open through request handling, rolls back on errors, then closes in `finally`. This is why connections are returned even after validation or authentication failures.

`HTTPException` is an intentional API error (401, 404, 422). Unexpected exceptions become a generic 500; secrets and financial payloads should never be leaked in tracebacks returned to clients.

## 3. Hashes and tokens

bcrypt is a slow, salted, one-way password hash. Login verifies a candidate password against a stored hash; it never decrypts it. JWTs are signed claims, not encrypted secrets. The server accepts only HS256, checks expiration, issuer, audience and token type, then checks the persisted session against the user ID. `get_current_session` makes logout effective before a JWT expires. A SHA-256 digest of the refresh token is stored; the browser receives the original only in an HttpOnly cookie. Refresh rotates the token under a database row lock. Ownership still has to be enforced separately for every data query.

## 4. Synchronous database work and asynchronous network work

Ordinary `def` routes using synchronous SQLAlchemy execute in FastAPI's worker threadpool. `async def` lets an external HTTP call yield while waiting: another request can run on the event loop. Blocking database or image decoding inside `async def` would defeat that advantage, so AI routes use `run_in_threadpool` for those operations. `async` does not make CPU-heavy work magically faster.

The Gemini service combines schema-constrained JSON generation with Pydantic validation after the network call. Never trust AI output as database-ready data. `try/except` translates timeout and malformed-output errors; `async with` releases the HTTP client.

## 5. React state and typed boundaries

Read `frontend/src/types.ts`, then `api.ts`. Interfaces are erased at runtime; they prevent mistakes during TypeScript compilation but do not secure an API. `Omit<Transaction, 'id'>` derives the creation payload from the shared transaction type.

`useState` owns transient UI state. Functional updates such as `setRows(old => [saved, ...old])` avoid closing over an outdated array after an asynchronous request. `useEffect` loads records after authentication; its cleanup avoids applying stale results. `useMemo` recalculates selected-month data only when dependencies change. Derived totals are calculated from records, not stored in competing state variables.

## 6. Theme and forms

`main.tsx` wraps the app with AntD `ConfigProvider`. `theme.darkAlgorithm` derives component colors from custom seed tokens. `Form` handles required fields; the backend remains the security boundary. `App.useApp()` exposes context-aware messages without bypassing the theme. CSS media queries collapse the sidebar and rearrange cards on mobile. Tailwind is available for small utility styles.

## 7. Follow one write end to end

Quick Log → AntD Form → `TransactionInput` → API fetch with JWT → FastAPI validation → current-user dependency → category ownership lookup → SQLAlchemy commit → response schema → React state update.

Receipt scan uses the same path only AFTER extraction and human review. AI natural-language logging shares the persistence service, so it cannot bypass category checks or amount validation.
