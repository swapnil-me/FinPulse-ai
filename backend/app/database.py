from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from .config import get_settings


class Base(DeclarativeBase):
    # Inheriting from Base registers mapped classes in shared metadata for Alembic.
    pass


engine = create_engine(get_settings().database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db():
    # yield dependencies act like context managers: FastAPI resumes finally after the request.
    db = SessionLocal()
    try:
        yield db
    except Exception:
        db.rollback()  # Failed requests must not leave partially applied database writes.
        raise
    finally:
        db.close()  # Always release the connection, including when an exception occurs.
