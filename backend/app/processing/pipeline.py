import json, logging
from datetime import datetime, timezone, timedelta
from app.core.redis import get_redis
from app.db import get_sync_session
from app.models.ioc import Ioc, IocStatus, IocSource
from .validator import IocValidator
from .type_inference import infer_type
from .normalizer import normalize
from .scorer import compute_score, ScoreContext

logger = logging.getLogger(__name__)
_validator = IocValidator()

def process_raw_queue(batch_size: int = 100):
    r = get_redis()
    for _ in range(batch_size):
        raw = r.lpop("queue:raw_iocs")
        if not raw: break
        try:
            _process_one(json.loads(raw))
        except Exception as e:
            logger.error(f"Error processing IOC: {e}")
            r.rpush("queue:dlq", raw)

def _process_one(payload: dict):
    value     = payload["value"]
    ioc_type  = payload.get("ioc_type")
    source_id = payload.get("source_id")
    raw_data  = payload.get("raw_data")

    if not ioc_type:
        ioc_type = infer_type(value)
    if not ioc_type:
        logger.warning(f"Type not inferable, discarded: {value!r}")
        return

    result = _validator.validate(value, ioc_type)
    if not result.valid:
        logger.warning(f"Invalid IOC [{result.error.value}] {value!r}: {result.detail}")
        return

    value = normalize(value, ioc_type)
    now   = datetime.now(timezone.utc)

    with get_sync_session() as session:
        existing = session.query(Ioc).filter(
            Ioc.value == value, Ioc.ioc_type == ioc_type).first()

        if existing:
            ioc = existing
            ioc.last_seen = now
            if ioc.status == IocStatus.EXPIRED:
                ioc.status = IocStatus.ACTIVE
            if ioc.ttl_days:
                ioc.expires_at = now + timedelta(days=ioc.ttl_days)
        else:
            ioc = Ioc(ioc_type=ioc_type, value=value,
                      status=IocStatus.ACTIVE, first_seen=now, last_seen=now)
            session.add(ioc)
            session.flush()

        if source_id:
            existing_src = session.query(IocSource).filter(
                IocSource.ioc_id == ioc.id,
                IocSource.source_id == source_id).first()
            if not existing_src:
                session.add(IocSource(
                    ioc_id=ioc.id, source_id=source_id,
                    seen_at=now, raw_data=raw_data))
                session.flush()

        count = session.query(IocSource).filter(IocSource.ioc_id == ioc.id).count()
        ioc.score = compute_score(ScoreContext(
            source_count=max(count, 1), feed_weight=1.0, ioc_type=ioc_type))
        session.commit()
