# Architettura ThreatFlow

## Layer

### Ingest
Connettori per feed esterni. Ogni connettore implementa `BaseConnector.fetch()`.
Supportati: HTTP (txt/csv/jsonl), TAXII/STIX 2.1, MISP, input manuale.

### Processing
Pipeline: validate → normalize → infer type → score → persist (upsert + dedup).
Aging: task orario che espira IOC con TTL scaduto.

### Executor (Flow Engine)
Il Flow Editor salva la pipeline come JSON. L'executor materializza ogni flusso
come grafo di Celery task con dispatch dinamico ai successori.

### Output
Export flat (blocklist firewall), JSON strutturato, Syslog/CEF, REST push.

## Sicurezza
- TLP (White/Green/Amber/Red) per ogni IOC
- Validazione rigorosa forma (regex, ipaddress lib)
- Valori normalizzati prima del persist (lowercase, canonical IP)

## Scalabilità
- Worker Celery scalabili orizzontalmente
- Chunking automatico batch > 2000 IOC
- Redis come broker + cache
