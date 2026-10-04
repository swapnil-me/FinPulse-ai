import logging
import time
from collections import defaultdict, deque
from fastapi import FastAPI, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .config import get_settings
from .security import get_current_user
from .routers import auth, transactions, ai, reports

app = FastAPI(title="FinPulse AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in get_settings().cors_origins.split(",")],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
)
# Per-process limiter is a baseline. Multi-instance deployments need a shared Redis/gateway limiter.
requests_by_client = defaultdict(deque)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    protected = request.url.path.startswith(("/auth/", "/ai/"))
    if protected:
        key = (request.client.host if request.client else "unknown", request.url.path)
        now = time.monotonic()
        queue = requests_by_client[key]
        while queue and queue[0] < now - 60:
            queue.popleft()
        if len(queue) >= 15:
            return JSONResponse(
                {"detail": "Too many requests. Try again in a minute."},
                status_code=429,
                headers={"Retry-After": "60"},
            )
        queue.append(now)
        if len(requests_by_client) > 10000:
            for stale in list(requests_by_client):
                if (
                    not requests_by_client[stale]
                    or requests_by_client[stale][-1] < now - 60
                ):
                    del requests_by_client[stale]
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(Exception)
async def unexpected_error(request: Request, exc: Exception):
    logging.getLogger("finpulse").error("Request failed: %s", type(exc).__name__)
    return JSONResponse(
        status_code=500, content={"detail": "Something went wrong. Please try again."}
    )


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth.router)
# Financial routers deny anonymous requests by default, including future endpoints added to them.
for router in (transactions.router, ai.router, reports.router):
    app.include_router(router, dependencies=[Depends(get_current_user)])
