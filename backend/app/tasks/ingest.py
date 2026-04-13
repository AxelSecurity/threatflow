import json
import logging
from datetime import datetime, timezone
from app.core.celery_app import app as celery_app
from app.db import get_sync_session
from app.models.source import Source
from app.ingest.registry import get_connector
from app.core.redis import get_redis
from app.processing.pipeline import process_raw_queue

logger = logging.getLogger(__name__)


def _log(source_id: str, level: str, message: str, meta: dict | None = None):
    """Scrive una entry nel log del connettore — non propaga eccezioni."""
    try:
        from app.models.source_log import SourceLog
        with get_sync_session() as session:
            session.add(SourceLog(
                source_id=source_id,
                level=level,
                message=message,
                meta=meta or {},
            ))
            session.commit()
    except Exception as e:
        logger.error(f"[source_log] Impossibile scrivere il log: {e}")


def _update_last_fetched(source_id: str):
    """Aggiorna last_fetched — chiamato sempre, anche in caso di errore."""
    try:
        with get_sync_session() as session:
            src = session.get(Source, source_id)
            if src:
                src.last_fetched = datetime.now(timezone.utc)
                session.commit()
    except Exception as e:
        logger.error(f"[source_log] Impossibile aggiornare last_fetched: {e}")


@celery_app.task(bind=True, max_retries=3, retry_backoff=True)
def fetch_feed(self, source_id: str):
    # 1. Carica la sorgente
    with get_sync_session() as session:
        source = session.get(Source, source_id)
        if not source or not source.active:
            return
        source_name = source.name
        feed_type   = source.feed_type
        config      = {**(source.config or {}), "url": source.url}

    _log(source_id, "INFO", f"Avvio fetch [{feed_type}] — {source_name}")

    # 2. Recupera IOC dal connettore
    try:
        connector = get_connector(feed_type, config)
        import asyncio
        raw_iocs = asyncio.run(connector.fetch())
        _log(source_id, "INFO",
             f"Recuperati {len(raw_iocs)} IOC grezzi dal feed",
             {"count": len(raw_iocs)})
    except Exception as exc:
        _log(source_id, "ERROR", f"Fetch fallito: {exc}")
        _update_last_fetched(source_id)
        raise self.retry(exc=exc)

    # 3. Accoda su Redis
    r = get_redis()
    pipe = r.pipeline()
    for ioc in raw_iocs:
        pipe.rpush("queue:raw_iocs", json.dumps({
            "source_id": source_id,
            "value":     ioc.value,
            "ioc_type":  ioc.ioc_type,
            "raw_data":  ioc.raw_data,
        }))
    pipe.execute()

    # 4. Pipeline: valida, normalizza, upsert
    processed = 0
    try:
        process_raw_queue(batch_size=len(raw_iocs) + 1)
        processed = len(raw_iocs)
        _log(source_id, "INFO",
             f"Pipeline completata — {processed} IOC processati",
             {"processed": processed})
    except Exception as exc:
        _log(source_id, "ERROR", f"Errore pipeline: {exc}")
        logger.error(f"[{source_name}] Pipeline error: {exc}")

    # 5. Aggiorna sempre last_fetched
    _update_last_fetched(source_id)
    logger.info(f"[{source_name}] Fetch completato: {len(raw_iocs)} IOC")


@celery_app.task
def schedule_all_feeds():
    now = datetime.now(timezone.utc)
    with get_sync_session() as session:
        sources = session.query(Source).filter(Source.active == True).all()
        for source in sources:
            if (source.last_fetched is None or
                    (now - source.last_fetched).seconds >= source.fetch_interval):
                fetch_feed.delay(str(source.id))
