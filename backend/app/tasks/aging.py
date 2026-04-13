import logging
from datetime import datetime, timezone
from celery import shared_task
from app.db import get_sync_session
from app.models import Ioc, IocStatus

logger = logging.getLogger(__name__)

@shared_task
def expire_stale_iocs():
    now = datetime.now(timezone.utc)
    with get_sync_session() as session:
        expired = session.query(Ioc).filter(
            Ioc.status == IocStatus.ACTIVE,
            Ioc.expires_at.isnot(None),
            Ioc.expires_at <= now).all()
        for ioc in expired:
            ioc.status = IocStatus.EXPIRED
        session.commit()
        if expired:
            logger.info(f"Aging: {len(expired)} IOC expired")
