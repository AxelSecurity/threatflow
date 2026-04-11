# ThreatFlow

Piattaforma open-source per la gestione degli Indicatori di Compromissione (IOC).
Pipeline completa: **ingest → processing → output**.

## Stack
| Layer | Tech |
|-------|------|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Celery |
| Database | PostgreSQL 16, Redis 7 |
| Frontend | React 18, TypeScript, TanStack Query |
| Infra | Docker Compose, Nginx |

## Avvio rapido
```bash
git clone https://github.com/TUO_USERNAME/threatflow.git
cd threatflow
docker compose up -d
cd backend && pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload --port 8000
```

API docs: http://localhost:8000/api/docs

## Tipi IOC supportati
`ipv4` · `ipv6` · `domain` · `url` · `md5` · `sha1` · `sha256` · `email`

## Licenza
MIT
