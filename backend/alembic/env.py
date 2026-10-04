from alembic import context
from app.database import Base, engine
from app import models

# Alembic compares versioned schema metadata; application startup never calls create_all.
if context.is_offline_mode():
    from app.config import get_settings

    context.configure(
        url=get_settings().database_url,
        target_metadata=Base.metadata,
        literal_binds=True,
    )
    with context.begin_transaction():
        context.run_migrations()
else:
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=Base.metadata)
        with context.begin_transaction():
            context.run_migrations()
