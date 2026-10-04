"""Integration tests exercise ownership and persistence, rather than mirroring implementation."""

import os

os.environ["DATABASE_URL"] = "sqlite://"
os.environ["SECRET_KEY"] = "test-only-secret-that-is-more-than-32-characters"
os.environ["ENVIRONMENT"] = "test"
os.environ["COOKIE_SECURE"] = "false"
import pytest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from jose import jwt
from app.database import Base, get_db
from app.main import app, requests_by_client
from app.config import get_settings
from app.schemas import ExpenseExtraction, ReceiptExtraction, AdviceResponse


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, expire_on_commit=False)

    def override():
        with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = override
    requests_by_client.clear()
    with TestClient(app, headers={"Origin": "http://localhost:5173"}) as client:
        yield client
    app.dependency_overrides.clear()
    engine.dispose()


def account(client, email="one@example.com"):
    r = client.post(
        "/auth/register",
        json={"name": "Test User", "email": email, "password": "very-secure-password"},
    )
    assert r.status_code == 201, r.text
    assert "password_hash" not in r.json()["user"]
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def transaction(**extra):
    return dict(
        amount="350.00",
        category="Food",
        kind="expense",
        date=str(date.today()),
        payment_mode="UPI",
        note="Lunch",
        **extra,
    )


def test_auth_and_duplicate(client):
    headers = account(client)
    assert client.get("/auth/me", headers=headers).status_code == 200
    assert (
        client.post(
            "/auth/register",
            json={
                "name": "Test",
                "email": "one@example.com",
                "password": "very-secure-password",
            },
        ).status_code
        == 409
    )
    assert (
        client.post(
            "/auth/login", json={"email": "one@example.com", "password": "bad"}
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/auth/login",
            json={"email": "one@example.com", "password": "very-secure-password"},
        ).status_code
        == 200
    )
    assert client.get("/transactions").status_code == 401
    expired = jwt.encode(
        {
            "sub": "1",
            "exp": datetime.now(timezone.utc) - timedelta(minutes=1),
            "aud": "finpulse-api",
            "iss": "finpulse",
        },
        get_settings().secret_key,
        algorithm="HS256",
    )
    assert (
        client.get(
            "/transactions", headers={"Authorization": f"Bearer {expired}"}
        ).status_code
        == 401
    )


def test_crud_isolation_and_filters(client):
    a, b = account(client), account(client, "two@example.com")
    created = client.post("/transactions", json=transaction(), headers=a)
    assert created.status_code == 201, created.text
    tid = created.json()["id"]
    assert created.json()["amount"] == "350.00"
    assert client.get("/transactions", headers=b).json() == []
    assert (
        client.put(f"/transactions/{tid}", json=transaction(), headers=b).status_code
        == 404
    )
    assert client.delete(f"/transactions/{tid}", headers=b).status_code == 404
    data = transaction()
    data["amount"] = "375.50"
    assert (
        client.put(f"/transactions/{tid}", json=data, headers=a).json()["amount"]
        == "375.50"
    )
    assert (
        len(
            client.get("/transactions?category=Food&payment_mode=UPI", headers=a).json()
        )
        == 1
    )
    assert client.get("/transactions?payment_mode=Cash", headers=a).json() == []
    assert client.delete(f"/transactions/{tid}", headers=a).status_code == 204
    assert client.get("/transactions", headers=a).json() == []


def test_validation(client):
    a = account(client)
    for key, value in [
        ("amount", "-1"),
        ("amount", "0"),
        ("amount", "2.999"),
        ("category", "Unknown"),
        ("payment_mode", "Bitcoin"),
        ("date", "not-a-date"),
    ]:
        data = transaction()
        data[key] = value
        assert client.post("/transactions", json=data, headers=a).status_code == 422
    assert (
        client.get(
            "/transactions?start=2026-09-29&end=2026-01-01", headers=a
        ).status_code
        == 422
    )


def test_reports(client):
    a, b = account(client), account(client, "two@example.com")
    data = transaction()
    data["note"] = '=HYPERLINK("evil")'
    client.post("/transactions", json=data, headers=a)
    month = date.today().strftime("%Y-%m")
    csv = client.get(f"/reports?month={month}&format=csv", headers=a)
    assert csv.status_code == 200 and "'=HYPERLINK" in csv.text
    assert "350.00" not in client.get(f"/reports?month={month}", headers=b).text
    pdf = client.get(f"/reports?month={month}&format=pdf", headers=a)
    assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


def test_ai_log_and_advice(client, monkeypatch):
    from app.routers import ai

    a = account(client)
    prompts = []

    async def fake(schema, prompt, *args):
        prompts.append(prompt)
        if schema is AdviceResponse:
            return AdviceResponse(answer="Review your Food budget.")
        return ExpenseExtraction(
            amount=Decimal("350"),
            category="Entertainment",
            payment_mode="UPI",
            note="movie tickets",
            date=date.today(),
        )

    monkeypatch.setattr(ai, "generate", fake)
    logged = client.post(
        "/ai/log", json={"text": "Paid 350 for movie tickets on UPI today"}, headers=a
    )
    assert logged.status_code == 201
    assert len(client.get("/transactions", headers=a).json()) == 1
    advice = client.post("/ai/advice", json={"text": "Where can I save?"}, headers=a)
    assert advice.status_code == 200
    assert (
        "Entertainment" in prompts[-1]
        and "one@example.com" not in prompts[-1]
        and "movie tickets" not in prompts[-1]
    )


def test_receipt_file_validation(client):
    a = account(client)
    response = client.post(
        "/ai/receipt",
        headers=a,
        files={"file": ("fake.jpg", b"not-an-image", "image/jpeg")},
    )
    assert response.status_code == 415
    response = client.post(
        "/ai/receipt",
        headers=a,
        files={"file": ("large.jpg", b"x" * (5 * 1024 * 1024 + 1), "image/jpeg")},
    )
    assert response.status_code == 413


def test_receipt_requires_review(client, monkeypatch):
    import io
    from PIL import Image
    from app.routers import ai

    a = account(client)

    async def fake(schema, prompt, *args):
        return ReceiptExtraction(
            amount=Decimal("350"),
            category="Food",
            payment_mode="Cash",
            note="Receipt",
            date=date.today(),
            items=[{"name": "Lunch", "amount": "350"}],
        )

    monkeypatch.setattr(ai, "generate", fake)
    buffer = io.BytesIO()
    Image.new("RGB", (20, 20)).save(buffer, format="PNG")
    response = client.post(
        "/ai/receipt",
        headers=a,
        files={"file": ("receipt.png", buffer.getvalue(), "image/png")},
    )
    assert response.status_code == 200
    assert response.json()["items"][0]["name"] == "Lunch"
    assert client.get("/transactions", headers=a).json() == []
