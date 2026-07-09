"""Punto de entrada de la API de Refleja."""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .database import init_db
from .routers import auth, platform, public

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("refleja")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # En dev/SQLite creamos las tablas automáticamente. En producción se usa
    # seed.sql sobre MariaDB (create_all no recrea tablas ya existentes).
    init_db()
    log.info("Refleja API lista (ENV=%s, puerto=%s)", settings.ENV, settings.APP_PORT)
    yield


app = FastAPI(
    title="Refleja API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/api/docs" if not settings.is_prod else None,
    redoc_url=None,
    openapi_url="/api/openapi.json" if not settings.is_prod else None,
)

# El origin_guard se registra ANTES que CORS para que CORS quede como el
# middleware más externo: así una respuesta 403 del guard también lleva las
# cabeceras CORS y el navegador puede leer el error (no un CORS opaco).
@app.middleware("http")
async def origin_guard(request: Request, call_next):
    """Blindaje opcional: si ORIGIN_SECRET está definido, se exige el header
    inyectado por Cloudflare. CloudPanel ya limita el origen a Cloudflare, así
    que por defecto está desactivado."""
    if settings.ORIGIN_SECRET and request.url.path.startswith("/api"):
        # Se permiten preflight OPTIONS sin el header.
        if request.method != "OPTIONS":
            provided = request.headers.get(settings.ORIGIN_SECRET_HEADER)
            if provided != settings.ORIGIN_SECRET:
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Origen no autorizado."},
                )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,  # necesario para la cookie de refresh
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Refleja-Token"],
    max_age=600,
)


@app.get("/api/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "env": settings.ENV}


app.include_router(public.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(platform.router, prefix="/api")
