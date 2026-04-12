import json
import logging
from datetime import datetime, timezone
from app.core.celery_app import app as celery_app
from app.db import get_sync_session
from app.models.source import Source
from app.ingest.registry import get_connector
from app.core.redis import get_redis

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, retry_backoff=True, autoretry_for=(Exception,))
def fetch_feed(self, source_id: str):
    with get_sync_session() as session:
        source = session.get(Source, source_id)
        if not source or not source.active:
            return
        config = {**source.config, "url": source.url}
        connector = get_connector(source.feed_type, config)
        import asyncio
        raw_iocs = asyncio.run(connector.fetch())

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
    logger.info(f"[{source.name}] Fetched {len(raw_iocs)} IOCs")

    with get_sync_session() as session:
        src = session.get(Source, source_id)
        src.last_fetched = datetime.now(timezone.utc)
        session.commit()


@celery_app.task
def schedule_all_feeds():
    now = datetime.now(timezone.utc)
    with get_sync_session() as session:
        sources = session.query(Source).filter(Source.active == True).all()
        for source in sources:
            if (source.last_fetched is None or
                    (now - source.last_fetched).seconds >= source.fetch_interval):
                fetch_feed.delay(str(source.id))
