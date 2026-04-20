# ThreatFlow

Piattaforma open-source per la gestione degli **Indicatori di Compromissione (IOC)**.  
Pipeline: **ingest → processing → output** — da feed esterni a SIEM, firewall e export flat.

---

## Indice

- [Funzionalità](#funzionalità)
- [Architettura](#architettura)
- [Stack tecnologico](#stack-tecnologico)
- [Struttura del progetto](#struttura-del-progetto)
- [Deploy con Docker Compose](#deploy-con-docker-compose)
- [Primo avvio](#primo-avvio)
- [Sviluppo locale (senza Docker)](#sviluppo-locale-senza-docker)
- [Variabili d'ambiente](#variabili-dampiente)
- [API — Panoramica endpoint](#api--panoramica-endpoint)
- [Tipi IOC supportati](#tipi-ioc-supportati)
- [Roadmap](#roadmap)

---

## Funzionalità

| Area | Stato |
|---|---|
| Autenticazione JWT con ruoli (admin / analyst / viewer) | ✅ |
| CRUD IOC con filtri, paginazione, tagging | ✅ |
| Pipeline di processing: validazione → normalizzazione → scoring | ✅ |
| Connettore HTTP (feed txt / csv / jsonl) | ✅ |
| Connettore Manual Ingest (inserimento manuale e override) | ✅ |
| Export flat (plaintext) e JSON | ✅ |
| Gestione sorgenti: crea, toggle attivo, fetch manuale, elimina | ✅ |
| Dettaglio sorgente: configurazione, log connettore, IOC recuperati | ✅ |
| Flow editor visuale con canvas drag-and-drop | ✅ |
| Parser DAG per flow (validazione strutturale, ranking) | ✅ |
| Scadenza automatica IOC (Celery beat) | ✅ |
| Dashboard con ricerca, filtri, score visualization | ✅ |
| Flow executor (esecuzione Celery DAG stateful) | ✅ |
| Output node verso SIEM / firewall (syslog CEF/RFC) | ✅ |
| Monitoraggio real-time con badge e polling | ✅ |
| Aging dinamico con Grace Period e countdown UI | ✅ |
| Validazione strutturale "Golden Path" e Guida Flusso | ✅ |
| Connettore TAXII | ⚠️ |
| Connettore MISP | 🔜 |


---

## Architettura Stateful & Real-time

ThreatFlow non è un semplice aggregatore stateless: è un **motore di elaborazione a grafi (Directed Acyclic Graph - DAG)** che mantiene la memoria dello stato di ogni singolo indicatore lungo tutta la pipeline.

### 🧠 Il Motore di Esecuzione (Flow Engine)
A differenza dei sistemi tradizionali, ogni nodo in ThreatFlow possiede una sua "consapevolezza":
- **Persistenza tramite `NodeIoc`**: Ogni volta che un indicatore attraversa un nodo, la sua presenza viene registrata nella tabella `NodeIoc` del database PostgreSQL. Questo garantisce che, interrogando un qualsiasi punto della pipeline (anche un filtro intermedio), si ottenga l'esatta fotografia degli IOC attivi in quel momento.
- **Esecuzione Asincrona**: La pipeline è alimentata da **Celery**, che gestisce l'esecuzione parallela dei nodi. Una modifica al flow o una sorgente aggiornata triggerano istantaneamente una cascata di eventi che aggiorna lo stato lungo tutto il grafico.
- **Caching Strategico con Redis**: Per permettere alla dashboard di mostrare migliaia di badge numerici senza saturare il database, le statistiche dei nodi sono gestite tramite un layer di cache in Redis con aggiornamento intelligente (TTL 10s), bilanciando precisione e scalabilità.

---

## Funzionalità Avanzate & Ciclo di Vita

### ⏱️ Dynamic Aging & Grace Period
Il sistema di Aging è il "cuore stateful" della piattaforma. Gestisce il ciclo di vita degli indicatori in modo dinamico:
1.  **Fase Active (Verde)**: Finché un indicatore è presente nella sorgente originale (feed), il nodo di Aging lo mantiene in stato "Active". La scadenza viene spostata nel futuro lontano a ogni refresh (Keep-Alive).
2.  **Fase Aging (Giallo/Arancio)**: Se l'indicatore sparisce dalla sorgente, il nodo di Aging se ne accorge confrontando l'input attuale con la sua memoria storica. Inizia qui il **Grace Period** (countdown configurabile): l'IOC resta nel flusso ma con una data di scadenza reale.
3.  **Fase Removal**: Allo scadere del countdown, l'indicatore viene rimosso automaticamente dal database del nodo e scompare da tutti i nodi di output successivi.

**Monitoraggio in tempo reale**: Cliccando su un nodo di Aging, avrai accesso a una tabella dedicata che mostra esattamente quali IOC sono "spariti" dalle sorgenti ma sono ancora trattenuti dal sistema, con tanto di countdown al secondo e indicizzazione della sorgente di provenienza.

### 📊 Dashboard Dinamica (Flow Console)
Il modulo FlowEditor è stato trasformato in una vera e propria console di controllo operativo:
- **Real-time Badges**: Visualizzazione immediata del carico di ogni nodo (numero di IOC gestiti) tramite badge color smeraldo.
- **Node Inspector & Custom Labels**: Ogni nodo di processing e output può essere rinominato per adattarsi alla logica di business (es. "Filtro IP Malevoli", "Export per SIEM Milano").
- **UX Consolidata**: Gestione intelligente degli eventi che permette di trascinare nodi, creare connessioni tra i pin e aprire le configurazioni senza conflitti di interfaccia.
- **Live Logs Integration**: Visualizzazione granulare dei log tecnici per singolo nodo, facilitando il debugging di filtri complessi direttamente dal canvas.

### 📐 Validazione Strutturale & Golden Path
Per aiutare gli analisti a costruire pipeline efficienti, ThreatFlow integra un sistema di validazione basato su **Ranks**:
1. **Golden Path**: Il sistema suggerisce l'ordine ottimale `Ingest → Filter → Dedup → Aging → Output`.
2. **Warn-on-violation**: Se provi a inserire un filtro dopo un nodo di Aging (operazione inefficiente), il sistema evidenzia il nodo in **arancione** spiegando il motivo tecnico (risparmio risorse DB).
3. **Guida Integrata**: Un pannello interattivo "GUIDA FLUSSO" nel canvas spiega i passaggi necessari per una configurazione a regola d'arte.

### ✍️ Manual Ingest & Data Integrity
Oltre ai feed automatici, ThreatFlow permette l'inserimento manuale tramite il connettore `manual_in`:
- **Override**: Possibilità di forzare Score e TLP per specifici indicatori.
- **Sync Mechnism**: Rilevamento automatico degli IOC rimossi manualmente per una pulizia istantanea di tutti i nodi di output collegati.


---

## Struttura del progetto

```
threatflow/
├── docker-compose.yml
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                  # FastAPI app, router registration
│       ├── db.py                    # Engine, sessione async, Base
│       ├── models/                  # SQLAlchemy ORM
│       │   ├── user.py              # User + ruoli
│       │   ├── ioc.py               # Ioc, IocSource, IocTag
│       │   ├── source.py            # Source (feed)
│       │   ├── source_log.py        # Log esecuzione connettore
│       │   ├── flow.py              # Flow (definizione JSON)
│       │   └── tag.py               # Tag
│       ├── api/
│       │   ├── deps.py              # Dipendenze FastAPI (auth, RBAC)
│       │   ├── schemas/             # Pydantic request/response models
│       │   └── routers/             # Endpoint HTTP
│       │       ├── auth.py          # /auth/register, /login, /me
│       │       ├── iocs.py          # CRUD IOC
│       │       ├── sources.py       # CRUD sorgenti + fetch/toggle
│       │       ├── flows.py         # CRUD flow + activate/deactivate
│       │       └── export.py        # /export/flat, /export/json
│       ├── processing/              # Pipeline di elaborazione IOC
│       │   ├── validator.py         # Regex + ipaddress validation
│       │   ├── normalizer.py        # Lowercase, canonical IP, URL norm
│       │   ├── type_inference.py    # Auto-detect tipo da valore
│       │   ├── scorer.py            # Score base + boost da sorgenti
│       │   └── pipeline.py          # Orchestrazione: upsert + dedup
│       ├── ingest/                  # Connettori sorgenti
│       │   ├── base.py              # BaseConnector (abstract)
│       │   ├── http.py              # HTTP txt/csv/jsonl
│       │   ├── taxii.py             # TAXII (stub — TODO)
│       │   └── registry.py          # Dispatch per feed_type
│       ├── executor/                # Flow engine
│       │   ├── parser.py            # Validazione DAG
│       │   ├── node_runner.py       # Esecuzione nodi (TODO)
│       │   └── tasks.py             # Task Celery per flow
│       ├── tasks/
│       │   ├── ingest.py            # fetch_feed(), schedule_all_feeds()
│       │   └── aging.py             # expire_stale_iocs()
│       └── core/
│           ├── celery_app.py        # Configurazione Celery
│           ├── redis.py             # Client Redis
│           └── security.py         # JWT encode/decode, bcrypt
└── frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── main.tsx                 # Router, Nav, ProtectedRoute
        ├── index.css                # Design system (variabili CSS)
        ├── lib/api.ts               # Client HTTP centralizzato
        ├── hooks/
        │   ├── useAuth.tsx          # AuthProvider + useAuth()
        │   └── useIocs.ts           # React Query hooks
        └── pages/
            ├── Login.tsx            # Pagina di login
            ├── Dashboard.tsx        # Tabella IOC + filtri + dettaglio
            ├── Sources.tsx          # Lista sorgenti
            ├── SourceDetail.tsx     # Dettaglio sorgente (config + log + IOC)
            └── FlowEditor.tsx       # Canvas flow visuale
```

---

## Deploy con Docker Compose

### Prerequisiti

- [Docker](https://docs.docker.com/get-docker/) ≥ 24
- [Docker Compose](https://docs.docker.com/compose/) ≥ 2.20 (incluso in Docker Desktop)

### 1 — Clona il repository

```bash
git clone https://github.com/AxelSecurity/threatflow.git
cd threatflow
```

### 2 — (Consigliato) Imposta una SECRET_KEY sicura

```bash
# Genera una chiave casuale e sostituiscila nel docker-compose.yml
openssl rand -hex 32
```

Apri `docker-compose.yml` e aggiorna il valore di `SECRET_KEY` nei servizi `backend` e `worker`.

### 3 — Avvia tutti i servizi

```bash
docker compose up -d --build
```

Docker costruirà le immagini e avvierà 5 container:

| Container | Porta esposta | Ruolo |
|---|---|---|
| `postgres` | 5432 | Database PostgreSQL |
| `redis` | 6379 | Broker Celery / cache |
| `backend` | 8000 | API FastAPI |
| `worker` | — | Celery worker (fetch feed, processing) |
| `beat` | — | Celery beat (scheduler) |
| `frontend` | 5173 | UI React (Vite dev server) |

### 4 — Inizializza il database

```bash
docker compose exec backend alembic upgrade head
```

> Se il comando restituisce "No config file found" o simile, il database viene comunque
> creato automaticamente al primo avvio del backend tramite `Base.metadata.create_all()`.
> Verifica che il backend sia healthy prima di procedere:
> ```bash
> docker compose logs backend --tail 20
> ```

### 5 — Verifica che tutto funzioni

```bash
docker compose ps
```

Tutti i servizi devono essere in stato `running` (o `Up`).

### 6 — Accedi all'applicazione

| Servizio | URL |
|---|---|
| **Frontend (UI)** | http://localhost:5173 |
| **API docs (Swagger)** | http://localhost:8000/api/docs |
| **API docs (ReDoc)** | http://localhost:8000/api/redoc |

---

## Primo avvio

### Crea il primo utente (admin)

Il primo utente registrato ottiene automaticamente il ruolo **admin**.

Tramite l'interfaccia grafica, vai su http://localhost:5173 — vedrai la pagina di login.  
Poiché non esiste ancora nessun utente, registra il primo account via API:

```bash
curl -X POST http://localhost:8000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "password-sicura",
    "display_name": "Admin"
  }'
```

Oppure usa la UI Swagger su http://localhost:8000/api/docs → `POST /auth/register`.

### Login

Vai su http://localhost:5173 e accedi con le credenziali appena create.

### Aggiungi una sorgente di test

Dalla pagina **Sorgenti** clicca "+ nuova sorgente":

| Campo | Valore di esempio |
|---|---|
| Nome | Feodo Tracker |
| Tipo | `http_feed` |
| URL | `https://feodotracker.abuse.ch/downloads/ipblocklist.txt` |
| Intervallo | `3600` (1 ora) |

Clicca **⟳ fetch** per scaricare subito il feed. Gli IOC appariranno nella Dashboard.

Clicca sul **nome della sorgente** per aprire la pagina di dettaglio con:
- **Configurazione**: tutti i parametri della sorgente
- **Log connettore**: cronologia dei fetch con livelli INFO / WARNING / ERROR (aggiornamento automatico ogni 5s)
- **IOC recuperati**: tabella paginata di tutti gli IOC importati da questa sorgente

---

## Sviluppo locale (senza Docker)

### Backend

```bash
cd backend

# Crea e attiva un virtualenv
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate

# Installa dipendenze
pip install -r requirements.txt

# Imposta le variabili d'ambiente
export DATABASE_URL="postgresql://threatflow:secret@localhost:5432/threatflow"
export REDIS_URL="redis://localhost:6379/0"
export SECRET_KEY="dev-secret-key-non-usare-in-produzione"

# Avvia PostgreSQL e Redis con Docker (solo i servizi infra)
docker compose up -d postgres redis

# Avvia il backend
uvicorn app.main:app --reload --port 8000

# In un altro terminale: avvia il worker Celery
celery -A app.core.celery_app worker --loglevel=info

# In un altro terminale: avvia il beat scheduler
celery -A app.core.celery_app beat --loglevel=info
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Il dev server Vite gira su http://localhost:5173 e fa proxy delle chiamate `/api/v1` verso il backend su `localhost:8000`.

---

## Variabili d'ambiente

| Variabile | Default (docker-compose) | Descrizione |
|---|---|---|
| `DATABASE_URL` | `postgresql://threatflow:secret@postgres:5432/threatflow` | Stringa di connessione PostgreSQL |
| `REDIS_URL` | `redis://redis:6379/0` | URL Redis (broker Celery + cache) |
| `SECRET_KEY` | `change-me-in-production-...` | Chiave HMAC per la firma dei JWT — **cambiare in produzione** |

> In produzione crea un file `.env` nella root di `backend/` oppure usa i secrets del tuo
> orchestratore (Docker Swarm secrets, Kubernetes Secrets, ecc.).

---

## API — Panoramica endpoint

Tutti gli endpoint sono sotto il prefisso `/api/v1`.  
Documentazione interattiva completa: http://localhost:8000/api/docs

### Autenticazione

| Metodo | Path | Descrizione |
|---|---|---|
| `POST` | `/auth/register` | Registra un nuovo utente |
| `POST` | `/auth/login` | Login → restituisce JWT |
| `GET` | `/auth/me` | Info utente corrente |

### IOC

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/iocs` | Lista IOC (filtri: `q`, `ioc_type`, `tlp`, `status`, `min_score`, `page`, `size`) |
| `POST` | `/iocs` | Crea IOC manualmente |
| `GET` | `/iocs/{id}` | Dettaglio IOC |
| `PATCH` | `/iocs/{id}` | Aggiorna IOC |
| `DELETE` | `/iocs/{id}` | Elimina IOC |

### Sorgenti

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/sources` | Lista sorgenti |
| `POST` | `/sources` | Crea sorgente |
| `GET` | `/sources/{id}` | Dettaglio sorgente (include `ioc_count`, `log_count`) |
| `POST` | `/sources/{id}/fetch` | Avvia fetch manuale (asincrono, HTTP 202) |
| `PATCH` | `/sources/{id}/toggle` | Attiva / disattiva sorgente |
| `DELETE` | `/sources/{id}` | Elimina sorgente |
| `GET` | `/sources/{id}/logs` | Log esecuzione connettore (param: `limit`) |
| `GET` | `/sources/{id}/iocs` | IOC importati da questa sorgente (param: `page`, `size`) |

### Flow

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/flows` | Lista flow |
| `POST` | `/flows` | Crea flow (invia definizione JSON) |
| `POST` | `/flows/{id}/activate` | Attiva flow |
| `POST` | `/flows/{id}/deactivate` | Disattiva flow |
| `DELETE` | `/flows/{id}` | Elimina flow |

### Export

| Metodo | Path | Descrizione |
|---|---|---|
| `GET` | `/export/flat` | Lista IOC in plaintext (parametri: `ioc_type`, `tlp`, `min_score`) |
| `GET` | `/export/json` | Lista IOC in JSON strutturato |

---

## Tipi IOC supportati

| Tipo | Esempi |
|---|---|
| `ipv4` | `1.2.3.4` |
| `ipv6` | `2001:db8::1` |
| `domain` | `malware.example.com` |
| `url` | `http://evil.com/payload` |
| `md5` | `d41d8cd98f00b204e9800998ecf8427e` |
| `sha1` | `da39a3ee5e6b4b0d3255bfef95601890afd80709` |
| `sha256` | `e3b0c44298fc1c149afb...` |
| `email` | `attacker@evil.com` |

---

## Roadmap

- [x] **Step 9** — Flow executor: esecuzione DAG come Celery task-graph
- [x] **Step 12** — Output node backends: siem_out (syslog/CEF), firewall_out (REST)
- [ ] **Step 10** — Connettore TAXII (completamento logica pool)
- [ ] **Step 11** — Connettore MISP
- [ ] **Step 13** — Pagina gestione utenti (admin)
- [ ] **Step 14** — Import batch IOC (upload file)
- [ ] **Step 15** — Migrazioni Alembic complete
- [ ] Audit log delle azioni utente
- [ ] Rate limiting API
- [ ] Notifiche real-time via WebSocket


---

## Licenza

MIT
