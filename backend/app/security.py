"""Authentication proves identity; owner-filtered queries separately enforce authorization."""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy import select, update
from sqlalchemy.orm import Session
from .config import get_settings
from .database import get_db
from .models import User, AuthSession

passwords = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = passwords.hash("dummy-password-for-timing-only")
COOKIE = "finpulse_refresh"


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def aware(value: datetime) -> datetime:
    # SQLite fixtures omit timezone metadata; PostgreSQL preserves it.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def unauthorized() -> HTTPException:
    return HTTPException(
        401, "Sign in again to continue.", headers={"WWW-Authenticate": "Bearer"}
    )


def digest(value: str) -> str:
    # Random high-entropy tokens need a fast hash, unlike human passwords which need bcrypt.
    return hashlib.sha256(value.encode()).hexdigest()


def cookie_origin(request: Request):
    # CORS alone does not prevent cross-site writes. Cookie endpoints reject absent/untrusted Origins.
    origin = request.headers.get("origin")
    # In development, allow requests without an Origin header (e.g. Postman, curl, direct API calls).
    # In production, an absent Origin is treated as untrusted to guard against CSRF.
    if origin is None and get_settings().environment == "development":
        return
    allowed = {x.strip() for x in get_settings().cors_origins.split(",")}
    if origin not in allowed:
        raise HTTPException(403, "Untrusted request origin.")


def set_refresh_cookie(response: Response, raw: str, expires_at: datetime):
    settings = get_settings()
    response.set_cookie(
        COOKIE,
        raw,
        httponly=True,
        secure=settings.cookie_secure,
        samesite=settings.cookie_samesite,
        path="/auth",
        max_age=max(0, int((aware(expires_at) - now_utc()).total_seconds())),
    )


def clear_refresh_cookie(response: Response):
    settings = get_settings()
    response.delete_cookie(
        COOKIE,
        path="/auth",
        secure=settings.cookie_secure,
        httponly=True,
        samesite=settings.cookie_samesite,
    )


def token_for(user: User, session: AuthSession) -> str:
    now = now_utc()
    return jwt.encode(
        {
            "sub": str(user.id),
            "sid": session.id,
            "type": "access",
            "iat": now,
            "exp": min(
                now + timedelta(minutes=get_settings().access_token_minutes),
                aware(session.expires_at),
            ),
            "iss": "finpulse",
            "aud": "finpulse-api",
        },
        get_settings().secret_key,
        algorithm="HS256",
    )


def issue_session(db: Session, user: User, response: Response) -> str:
    sid = str(uuid.uuid4())
    raw = sid + "." + secrets.token_urlsafe(48)
    session = AuthSession(
        id=sid,
        user_id=user.id,
        refresh_hash=digest(raw),
        expires_at=now_utc() + timedelta(days=get_settings().refresh_token_days),
    )
    db.add(session)
    db.commit()
    set_refresh_cookie(response, raw, session.expires_at)
    return token_for(user, session)


def get_current_session(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    db: Session = Depends(get_db),
) -> AuthSession:
    if not credentials:
        raise unauthorized()
    try:
        claims = jwt.decode(
            credentials.credentials,
            get_settings().secret_key,
            algorithms=["HS256"],
            audience="finpulse-api",
            issuer="finpulse",
            options={"require_exp": True, "require_sub": True, "require_iat": True},
        )
        if claims.get("type") != "access":
            raise unauthorized()
        session = db.get(AuthSession, str(uuid.UUID(claims["sid"])))
        uid = int(claims["sub"])
    except (JWTError, ValueError, KeyError, TypeError):
        raise unauthorized()
    # Checking persisted session state makes even an unexpired JWT immediately revocable.
    if (
        not session
        or session.user_id != uid
        or session.revoked_at
        or aware(session.expires_at) <= now_utc()
    ):
        raise unauthorized()
    return session


def get_current_user(
    session: AuthSession = Depends(get_current_session), db: Session = Depends(get_db)
) -> User:
    # FastAPI caches shared dependencies per request; routes never accept a client-supplied owner.
    user = db.get(User, session.user_id)
    if user is None:
        raise unauthorized()
    return user


def rotate_session(db: Session, raw: str, response: Response) -> tuple[User, str]:
    try:
        sid = str(uuid.UUID(raw.split(".", 1)[0]))
    except (ValueError, AttributeError):
        raise unauthorized()
    # Row lock serializes refreshes in PostgreSQL. Reuse revokes the entire session family.
    session = db.scalar(
        select(AuthSession).where(AuthSession.id == sid).with_for_update()
    )
    if not session or session.revoked_at or aware(session.expires_at) <= now_utc():
        raise unauthorized()
    if not hmac.compare_digest(session.refresh_hash, digest(raw)):
        session.revoked_at = now_utc()
        db.commit()
        raise unauthorized()
    user = db.get(User, session.user_id)
    if not user:
        raise unauthorized()
    rotated = sid + "." + secrets.token_urlsafe(48)
    session.refresh_hash = digest(rotated)
    db.commit()
    set_refresh_cookie(response, rotated, session.expires_at)
    return user, token_for(user, session)


def revoke_all(db: Session, user_id: int):
    db.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=now_utc())
    )
