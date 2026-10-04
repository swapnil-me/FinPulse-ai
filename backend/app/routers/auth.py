from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Category, AuthSession
from ..schemas import Register, Login, TokenResponse, UserResponse, PasswordChange
from ..security import (
    passwords,
    get_current_user,
    get_current_session,
    DUMMY_HASH,
    issue_session,
    rotate_session,
    cookie_origin,
    clear_refresh_cookie,
    revoke_all,
    now_utc,
    COOKIE,
)
from ..services.transactions import CATEGORIES

router = APIRouter(prefix="/auth", tags=["Authentication"])


def auth_response(user: User, access: str) -> TokenResponse:
    return TokenResponse(access_token=access, user=UserResponse.model_validate(user))


@router.post(
    "/register",
    response_model=TokenResponse,
    status_code=201,
    dependencies=[Depends(cookie_origin)],
)
def register(data: Register, response: Response, db: Session = Depends(get_db)):
    user = User(
        name=data.name,
        email=str(data.email).lower(),
        password_hash=passwords.hash(data.password),
    )
    user.categories = [Category(name=name) for name in CATEGORIES]
    try:
        db.add(user)
        db.flush()  # Allocate the owner ID without a separate account-creation commit.
        access = issue_session(db, user, response)
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Unable to create an account with these details.")
    return auth_response(user, access)


@router.post(
    "/login", response_model=TokenResponse, dependencies=[Depends(cookie_origin)]
)
def login(data: Login, response: Response, db: Session = Depends(get_db)):
    # Lock the user row so login and password changes cannot issue a session across a password reset.
    user = db.scalar(
        select(User).where(User.email == str(data.email).lower()).with_for_update()
    )
    try:
        valid = passwords.verify(
            data.password, user.password_hash if user else DUMMY_HASH
        )
    except ValueError:
        valid = False
    if not user or not valid:
        raise HTTPException(401, "Incorrect email or password.")
    return auth_response(user, issue_session(db, user, response))


@router.post(
    "/refresh", response_model=TokenResponse, dependencies=[Depends(cookie_origin)]
)
def refresh(request: Request, response: Response, db: Session = Depends(get_db)):
    user, access = rotate_session(db, request.cookies.get(COOKIE, ""), response)
    return auth_response(user, access)


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    session: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    session.revoked_at = now_utc()
    db.commit()
    clear_refresh_cookie(response)


@router.post("/logout-all", status_code=204)
def logout_all(
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    revoke_all(db, user.id)
    db.commit()
    clear_refresh_cookie(response)


@router.post("/change-password", status_code=204)
def change_password(
    data: PasswordChange,
    response: Response,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.scalar(
        select(User)
        .where(User.id == user.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    try:
        valid = passwords.verify(data.current_password, user.password_hash)
    except ValueError:
        valid = False
    if not valid:
        raise HTTPException(400, "Current password is incorrect.")
    if data.current_password == data.new_password:
        raise HTTPException(422, "Choose a different password.")
    user.password_hash = passwords.hash(data.new_password)
    # Password change and all-session revocation commit atomically. Sign in again afterwards.
    revoke_all(db, user.id)
    db.commit()
    clear_refresh_cookie(response)


@router.get("/sessions")
def sessions(
    current: AuthSession = Depends(get_current_session), db: Session = Depends(get_db)
):
    rows = db.scalars(
        select(AuthSession)
        .where(
            AuthSession.user_id == current.user_id,
            AuthSession.revoked_at.is_(None),
            AuthSession.expires_at > now_utc(),
        )
        .order_by(AuthSession.created_at.desc())
    ).all()
    return [
        {
            "id": s.id,
            "created_at": s.created_at,
            "expires_at": s.expires_at,
            "current": s.id == current.id,
        }
        for s in rows
    ]


@router.delete("/sessions/{session_id}", status_code=204)
def revoke_session(
    session_id: str,
    response: Response,
    current: AuthSession = Depends(get_current_session),
    db: Session = Depends(get_db),
):
    target = db.scalar(
        select(AuthSession).where(
            AuthSession.id == session_id, AuthSession.user_id == current.user_id
        )
    )
    # A foreign ID and a missing ID receive the same response: do not reveal whether other sessions exist.
    if not target:
        raise HTTPException(404, "Session not found.")
    target.revoked_at = now_utc()
    db.commit()
    if target.id == current.id:
        clear_refresh_cookie(response)
