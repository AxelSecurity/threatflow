import json
import logging
from datetime import datetime, timezone
from app.core.celery_app import app as celery_app
from app.db import get_sync_session
from app.models import Source
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
        import uuid
        with get_sync_session() as session:
            src = session.get(Source, uuid.UUID(source_id))
            if src:
                src.last_fetched = datetime.now(timezone.utc)
                session.commit()
    except Exception as e:
        logger.error(f"[source_log] Impossibile aggiornare last_fetched: {e}")


@celery_app.task(bind=True, max_retries=3, retry_backoff=True)
def fetch_feed(self, source_id: str):
    import uuid
    # 1. Carica la sorgente
    with get_sync_session() as session:
        source = session.get(Source, uuid.UUID(source_id))
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

    # 4b. Sincronizzazione per tutti gli Ingest (Cleanup rimosse)
    try:
        from sqlalchemy import delete, select
        from app.models.ioc import Ioc, IocSource
        new_values = [ioc.value for ioc in raw_iocs]
        with get_sync_session() as session:
            # 1. Trova ID degli IOC validi nel batch corrente
            valid_ids_stmt = select(Ioc.id).where(Ioc.value.in_(new_values))
            
            # 2. Elimina legami IocSource obsoleti e recupera quali sono stati tolti
            del_links_stmt = (
                delete(IocSource)
                .where(IocSource.source_id == uuid.UUID(source_id))
                .where(~IocSource.ioc_id.in_(valid_ids_stmt))
                .returning(IocSource.ioc_id)
            )
            deleted_ioc_ids_tuples = session.execute(del_links_stmt).fetchall()
            deleted_ioc_ids = [r[0] for r in deleted_ioc_ids_tuples]
            
            # 3. Elimina IOC orfani immediatamente (SOLO per manual_in)
            if feed_type == "manual_in" and deleted_ioc_ids:
                from app.models.node_ioc import NodeIoc
                from app.models.tag import IocTag
                
                # Identifica quali degli indicatori rimossi sono diventati dei veri orfani
                true_orphans_stmt = select(Ioc.id).where(Ioc.id.in_(deleted_ioc_ids)).where(~Ioc.id.in_(select(IocSource.ioc_id)))
                true_orphans = [r[0] for r in session.execute(true_orphans_stmt).fetchall()]
                
                if true_orphans:
                    # a) Pulisce le dipendenze in node_ioc (forzando cancellazione per output nodes)
                    del_nodeioc_stmt = delete(NodeIoc).where(NodeIoc.ioc_id.in_(true_orphans))
                    session.execute(del_nodeioc_stmt)
                    
                    # b) Pulisce le dipendenze in ioc_tag
                    del_ioctag_stmt = delete(IocTag).where(IocTag.ioc_id.in_(true_orphans))
                    session.execute(del_ioctag_stmt)

                    # c) Pulisce gli IOC orfani dal sistema
                    del_orphans_stmt = delete(Ioc).where(Ioc.id.in_(true_orphans))
                    session.execute(del_orphans_stmt)
            
            session.commit()
        _log(source_id, "INFO", "Sincronizzazione completata: rimosse voci non più presenti nella sorgente")
    except Exception as e:
        _log(source_id, "ERROR", f"Errore sincronizzazione: {e}")
        logger.error(f"[{source_name}] Sync error: {e}")

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
