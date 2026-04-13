import os
from celery import Celery
from celery.schedules import crontab

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
app = Celery(
    "threatflow",
    broker=REDIS_URL,
    backend=REDIS_URL,
    include=["app.tasks.ingest", "app.tasks.aging", "app.executor.tasks"]
)
app.conf.task_serializer = "json"
app.conf.result_serializer = "json"
app.conf.accept_content = ["json"]
app.conf.beat_schedule = {
    "schedule-all-feeds": {
        "task": "app.tasks.ingest.schedule_all_feeds",
        "schedule": 300,
    },
    "expire-stale-iocs": {
        "task": "app.tasks.aging.expire_stale_iocs",
        "schedule": crontab(minute=0),
    },
    "schedule-all-flows": {
        "task": "app.executor.tasks.schedule_all_flows",
        "schedule": 300,
    },
}
