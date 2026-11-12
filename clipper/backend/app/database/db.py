from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from ..core import config

config.ensure_dirs()
engine = create_engine(config.DB_URL, connect_args={"check_same_thread": False, "timeout": 30})


@event.listens_for(engine, "connect")
def _pragmas(conn, _):
    cur = conn.cursor()
    cur.execute("PRAGMA journal_mode=WAL")
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


SessionLocal = sessionmaker(engine, expire_on_commit=False)


def get_db():
    with SessionLocal() as db:
        yield db


def migrate() -> None:
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(config.ROOT / "backend" / "alembic.ini"))
    cfg.set_main_option("prepend_sys_path", str(config.ROOT / "backend"))
    cfg.set_main_option("script_location", str(config.ROOT / "backend" / "migrations"))
    command.upgrade(cfg, "head")
