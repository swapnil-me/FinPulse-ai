import asyncio
import base64
from typing import TypeVar
import httpx
from fastapi import HTTPException
from pydantic import BaseModel, ValidationError
from ..config import get_settings

T = TypeVar("T", bound=BaseModel)


async def generate(
    schema: type[T], prompt: str, image: bytes | None = None, mime: str | None = None
) -> T:
    settings = get_settings()
    if not settings.gemini_api_key:
        raise HTTPException(
            503, "AI is not configured. Add GEMINI_API_KEY on the server."
        )
    parts = [{"text": prompt}]
    if image:
        parts.append(
            {
                "inline_data": {
                    "mime_type": mime,
                    "data": base64.b64encode(image).decode(),
                }
            }
        )
    # async def yields control at await during network I/O. It does NOT make blocking ORM calls async.
    # A bounded timeout prevents an unavailable AI provider from holding requests forever.
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{settings.gemini_model}:generateContent",
                headers={"x-goog-api-key": settings.gemini_api_key},
                json={
                    "contents": [{"role": "user", "parts": parts}],
                    "generationConfig": {
                        "responseMimeType": "application/json",
                        "responseJsonSchema": schema.model_json_schema(),
                        "temperature": 0.2,
                    },
                },
            )
            response.raise_for_status()
            result = response.json()["candidates"][0]["content"]["parts"]
            content = "".join(
                part.get("text", "") for part in result if not part.get("thought")
            )
            # JSON syntax alone is insufficient: Pydantic revalidates positive amounts, dates, and enums.
            return schema.model_validate_json(content)
    except httpx.TimeoutException:
        raise HTTPException(504, "AI took too long. Please try again.")
    except (httpx.HTTPError, ValueError, KeyError, IndexError, ValidationError):
        # Never expose upstream payloads, receipts, tokens, or secrets in public errors/logs.
        raise HTTPException(
            502, "AI could not return reliable data. Try again or enter it manually."
        )
