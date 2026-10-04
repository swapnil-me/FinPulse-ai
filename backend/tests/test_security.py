"""Adversarial tests: valid login must never imply permission to another owner's records."""

from test_api import client, account, transaction
import pytest
from datetime import datetime, timedelta, timezone
from jose import jwt
from sqlalchemy import text, select
from sqlalchemy.exc import IntegrityError
from app.config import get_settings
from app.security import COOKIE


def test_logout_revokes_access_and_refresh(client):
    a = account(client)
    raw = client.cookies.get(COOKIE)
    assert client.post("/auth/logout", headers=a).status_code == 204
    assert client.get("/auth/me", headers=a).status_code == 401
    client.cookies.set(COOKIE, raw)
    assert client.post("/auth/refresh").status_code == 401


def test_refresh_rotation_and_replay(client):
    a = account(client)
    old = client.cookies.get(COOKIE)
    r = client.post("/auth/refresh")
    assert r.status_code == 200
    new = {"Authorization": "Bearer " + r.json()["access_token"]}
    latest = client.cookies.get(COOKIE)
    assert old != latest
    assert client.get("/auth/me", headers=new).status_code == 200
    client.cookies.clear()
    client.cookies.set(COOKIE, old)
    assert client.post("/auth/refresh").status_code == 401
    for h in [a, new]:
        assert client.get("/auth/me", headers=h).status_code == 401
    client.cookies.clear()
    client.cookies.set(COOKIE, latest)
    assert client.post("/auth/refresh").status_code == 401


def test_origin_csrf_protection(client):
    account(client)
    for origin in ["https://evil.example", "null"]:
        assert (
            client.post("/auth/refresh", headers={"Origin": origin}).status_code == 403
        )
    client.headers.pop("Origin")
    assert client.post("/auth/refresh").status_code == 403
    client.headers["Origin"] = "http://localhost:5173"
    assert client.post("/auth/refresh").status_code == 200


def test_cookie_flags_and_redaction(client):
    r = client.post(
        "/auth/register",
        json={
            "name": "User",
            "email": "one@example.com",
            "password": "very-secure-password",
        },
    )
    cookie = r.headers["set-cookie"].lower()
    assert all(flag in cookie for flag in ["httponly", "samesite=lax", "path=/auth"])
    assert "refresh_hash" not in r.text and COOKIE not in r.text
    assert r.headers["cache-control"] == "no-store"


def test_session_ownership_and_logout_all(client):
    a = account(client)
    r = client.post(
        "/auth/login",
        json={"email": "one@example.com", "password": "very-secure-password"},
    )
    a2 = {"Authorization": "Bearer " + r.json()["access_token"]}
    b = account(client, "two@example.com")
    sa = client.get("/auth/sessions", headers=a).json()
    sb = client.get("/auth/sessions", headers=b).json()
    assert len(sa) == 2 and len(sb) == 1
    assert client.delete("/auth/sessions/" + sa[0]["id"], headers=b).status_code == 404
    assert client.post("/auth/logout-all", headers=a).status_code == 204
    for h in [a, a2]:
        assert client.get("/auth/me", headers=h).status_code == 401
    assert client.get("/auth/me", headers=b).status_code == 200


def test_revoke_one_session(client):
    a = account(client)
    r = client.post(
        "/auth/login",
        json={"email": "one@example.com", "password": "very-secure-password"},
    )
    other = {"Authorization": "Bearer " + r.json()["access_token"]}
    target = next(
        s for s in client.get("/auth/sessions", headers=a).json() if not s["current"]
    )
    assert client.delete("/auth/sessions/" + target["id"], headers=a).status_code == 204
    assert client.get("/auth/me", headers=other).status_code == 401
    assert client.get("/auth/me", headers=a).status_code == 200


def test_password_change(client):
    a = account(client)
    assert (
        client.post(
            "/auth/change-password",
            headers=a,
            json={"current_password": "wrong", "new_password": "another-safe-password"},
        ).status_code
        == 400
    )
    assert client.get("/auth/me", headers=a).status_code == 200
    assert (
        client.post(
            "/auth/change-password",
            headers=a,
            json={
                "current_password": "very-secure-password",
                "new_password": "another-safe-password",
            },
        ).status_code
        == 204
    )
    assert client.get("/auth/me", headers=a).status_code == 401
    assert (
        client.post(
            "/auth/login",
            json={"email": "one@example.com", "password": "very-secure-password"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login",
            json={"email": "one@example.com", "password": "another-safe-password"},
        ).status_code
        == 200
    )


def test_forged_jwt_claims(client):
    a = account(client)
    claims = jwt.get_unverified_claims(a["Authorization"].split(" ")[1])
    for key, value in [
        ("sub", "9999"),
        ("type", "refresh"),
        ("aud", "other-api"),
        ("iss", "other-issuer"),
        ("sid", "bad-id"),
    ]:
        token = jwt.encode(
            {**claims, key: value}, get_settings().secret_key, algorithm="HS256"
        )
        assert (
            client.get(
                "/transactions", headers={"Authorization": "Bearer " + token}
            ).status_code
            == 401
        )
    token = jwt.encode(
        claims, "different-key-that-is-more-than-32-chars", algorithm="HS256"
    )
    assert (
        client.get(
            "/transactions", headers={"Authorization": "Bearer " + token}
        ).status_code
        == 401
    )


def test_owner_injection_rejected(client):
    a = account(client)
    for key in ["user_id", "category_id", "role"]:
        data = transaction()
        data[key] = 999
        assert client.post("/transactions", headers=a, json=data).status_code == 422
    assert (
        client.post(
            "/auth/register",
            json={
                "name": "Admin",
                "email": "admin@example.com",
                "password": "very-secure-password",
                "role": "admin",
            },
        ).status_code
        == 422
    )


def test_protected_routes(client):
    cases = [
        ("GET", "/transactions", None),
        ("POST", "/transactions", transaction()),
        ("PUT", "/transactions/1", transaction()),
        ("DELETE", "/transactions/1", None),
        ("GET", "/reports?month=2026-09", None),
        ("POST", "/ai/log", {"text": "Paid 350 for lunch"}),
        ("POST", "/ai/advice", {"text": "Where can I save?"}),
        ("GET", "/auth/sessions", None),
    ]
    for method, path, payload in cases:
        assert (
            client.request(
                method, path, **({"json": payload} if payload else {})
            ).status_code
            == 401
        )


def test_advice_isolation(client, monkeypatch):
    from app.routers import ai
    from app.schemas import AdviceResponse

    a = account(client)
    b = account(client, "two@example.com")
    data = transaction()
    data["category"] = "Rent"
    data["amount"] = "9876"
    assert client.post("/transactions", headers=a, json=data).status_code == 201
    captured = []

    async def fake(schema, prompt, *args):
        captured.append(prompt)
        return AdviceResponse(answer="No recorded expenses.")

    monkeypatch.setattr(ai, "generate", fake)
    assert (
        client.post(
            "/ai/advice", headers=b, json={"text": "How much did I spend?"}
        ).status_code
        == 200
    )
    assert "9876" not in captured[-1] and "Rent" not in captured[-1]


def test_database_owner_constraint(client):
    from app.main import app
    from app.database import get_db

    a = account(client)
    account(client, "two@example.com")
    row = client.post("/transactions", headers=a, json=transaction()).json()
    dependency = app.dependency_overrides[get_db]()
    db = next(dependency)
    try:
        db.execute(text("PRAGMA foreign_keys=ON"))
        category = db.scalar(text("SELECT id FROM categories WHERE user_id=2 LIMIT 1"))
        with pytest.raises(IntegrityError):
            db.execute(
                text("UPDATE transactions SET category_id=:category WHERE id=:id"),
                {"category": category, "id": row["id"]},
            )
            db.commit()
        db.rollback()
    finally:
        dependency.close()


def test_expired_persisted_session(client):
    from app.main import app
    from app.database import get_db
    from app.models import AuthSession

    a = account(client)
    dependency = app.dependency_overrides[get_db]()
    db = next(dependency)
    try:
        row = db.scalar(select(AuthSession))
        row.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()
    finally:
        dependency.close()
    assert client.get("/auth/me", headers=a).status_code == 401
    assert client.post("/auth/refresh").status_code == 401
