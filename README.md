# ThreatFlow

IOC management platform. Pipeline: **ingest → processing → output**.

## Quick start
```bash
docker compose up -d --build
docker compose exec backend alembic upgrade head
```
- API docs: http://localhost:8000/api/docs
- Frontend: http://localhost:5173

## IOC types
ipv4 · ipv6 · domain · url · md5 · sha1 · sha256 · email

## License: MIT
