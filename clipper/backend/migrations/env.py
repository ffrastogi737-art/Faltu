from alembic import context

from app import models
from app.database.db import engine

target_metadata = models.Base.metadata

if context.is_offline_mode():
    raise SystemExit("Offline migrations are not supported; run against the SQLite file.")
with engine.connect() as connection:
    # render_as_batch lets Alembic alter SQLite tables, which SQLite cannot do in place
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()
