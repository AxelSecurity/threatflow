import json
import logging
import asyncio
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import func, insert, and_, or_
from app.ingest.registry import get_connector
from app.db import get_sync_session
from app.models import Source, Flow
from app.models.node_ioc import NodeIoc
from app.models.ioc import Ioc

logger = logging.getLogger(__name__)


def fetch_from_node(node) -> list:
    """Recupera IOC da un nodo ingest."""
    if node.type == "source_ingest":
        source_id = node.config.get("source_id")
        if not source_id:
            return []
        from app.models.ioc import Ioc, IocSource
        with get_sync_session() as session:
            results = (
                session.query(Ioc)
                .join(IocSource)
                .filter(IocSource.source_id == uuid.UUID(source_id))
                .all()
            )
            return [
                {"value": r.value, "ioc_type": r.ioc_type, "score": r.score, "tlp": r.tlp}
                for r in results
            ]

    # Nodi ingest diretti (http_feed, taxii_in, misp_in, manual_in)
    # Usa il tipo del nodo direttamente — il registry gestisce il mapping
    config = {**node.config}
    try:
        connector = get_connector(node.type, config)
        raw_iocs = asyncio.run(connector.fetch())
        return [{"value": r.value, "ioc_type": r.ioc_type, "raw_data": r.raw_data} for r in raw_iocs]
    except ValueError as e:
        logger.warning(f"[node_runner] Connettore non disponibile per {node.type}: {e}")
        return []


def run_processing_node(node, iocs: list, flow_id: str, source_node_id: str = None) -> list:
    """Applica filtri o dedup alla lista IOC e aggiorna lo stato del nodo."""
    t, cfg = node.type, node.config
    
    # Calcola nuovo TTL se è un nodo aging
    ttl_delta = None
    if t == "aging":
        unit = cfg.get("unit") or "minutes"  # '' o None → default "minutes"
        val = int(cfg.get("value") or 1)
        mult = {"minutes": 60, "hours": 3600, "days": 86400}.get(unit, 60)
        ttl_sec = val * mult
        
        # Logica Stateful: Carichiamo lo stato attuale del nodo dal DB
        from app.models.node_ioc import NodeIoc
        from app.models.ioc import Ioc
        from sqlalchemy import and_
        
        with get_sync_session() as session:
            db_iocs = session.query(NodeIoc, Ioc.value, Ioc.ioc_type).join(Ioc).filter(
                and_(NodeIoc.flow_id == flow_id, NodeIoc.node_id == node.id)
            ).all()
            
            # Mappa degli IOC attualmente nel DB per questo nodo
            # (value, type) -> {ioc_id, expires_at, source_node_id, last_seen_at}
            state = { (r.value, r.ioc_type): r.NodeIoc for r in db_iocs }
            
            now = datetime.now(timezone.utc)
            incoming_keys = set()
            result = []
            
            # 1. Processiamo gli IOC in ingresso (Attivi)
            # Raccogliamo anche i source_node_id presenti nella batch corrente
            incoming_source_nodes = set()
            for i in iocs:
                key = (i["value"], i.get("ioc_type"))
                incoming_keys.add(key)
                if i.get("_source_node_id"):
                    incoming_source_nodes.add(i["_source_node_id"])

                i["_ttl"] = None # Active: nessuna scadenza imminente impostata qui
                i["_is_aging"] = False
                result.append(i)

            # Se la batch è vuota ma conosciamo la sorgente (parametro esplicito),
            # usiamo quello per identificare quale source node ha 0 IOC.
            # Senza questo, il nodo aging non saprebbe quali IOC mettere in aging.
            if not incoming_source_nodes and source_node_id:
                incoming_source_nodes = {source_node_id}

            # 2. Identifichiamo gli IOC in Aging (presenti nel DB ma non nell'input)
            # IMPORTANTE: consideriamo solo gli IOC che provengono dagli stessi source_node_id
            # della batch corrente. Gli IOC di altri input node non devono essere toccati
            # finché non arriva la loro batch — altrimenti l'aging si attiva per tutti
            # ogni volta che un qualsiasi input node si aggiorna.
            for key, db_record in state.items():
                if key not in incoming_keys:
                    # Salta IOC che provengono da source node non presenti nella batch corrente
                    if incoming_source_nodes and db_record.source_node_id not in incoming_source_nodes:
                        continue

                    # Se non è già in fase di scadenza, iniziamo il countdown
                    # Usiamo un margine di 1 anno per indicare il "non aging"
                    is_currently_aging = db_record.expires_at and (db_record.expires_at - now).total_seconds() < 31536000 # 1 anno

                    if not is_currently_aging:
                        # Inizia aging ora
                        db_record.expires_at = now + timedelta(seconds=ttl_sec)

                    # Se non è ancora scaduto, lo manteniamo nel flusso
                    if db_record.expires_at > now:
                        result.append({
                            "value": key[0],
                            "ioc_type": key[1],
                            "_source_node_id": db_record.source_node_id,
                            "_is_aging": True,
                            "_expires_at": db_record.expires_at.isoformat()
                        })
            
            # Salviamo le modifiche agli expires_at degli IOC in aging
            session.commit()

        # Assicuriamo che gli IOC attivi esistano nella tabella ioc principale
        # prima di salvare lo stato del nodo aging.
        # Per nodi manual_in/http_feed gli IOC non vengono persistiti fino al
        # nodo di output (che gira DOPO): se saltiamo questo step, ioc_map in
        # _update_node_state non trova nulla → lo stato è sempre vuoto → il nodo
        # aging non sa mai che l'IOC era presente → quando sparisce dalla sorgente
        # non parte il countdown e l'IOC scompare immediatamente dall'output.
        active_iocs = [i for i in result if not i.get("_is_aging")]
        if active_iocs:
            _persist_iocs(active_iocs)  # solo per garantire esistenza in tabella ioc

        _update_node_state(flow_id, node.id, result)
        return result

    elif t == "filter_type":
        target = cfg.get("ioc_type")
        if not target:
            result = iocs
        else:
            # Normalizziamo la lista dei tipi target in minuscolo
            if isinstance(target, str):
                target_list = [target.lower()]
            else:
                target_list = [str(t).lower() for t in target]
            
            from app.processing.type_inference import infer_type
            result = []
            for i in iocs:
                val = i.get("value", "")
                itype = i.get("ioc_type")
                
                # Se il tipo manca, proviamo a dedurlo
                if not itype: 
                    itype = infer_type(val)
                
                # Confronto case-insensitive
                if itype and itype.lower() in target_list:
                    i["ioc_type"] = itype.lower() # Normalizziamo anche l'output
                    result.append(i)
    elif t == "filter_tlp":
        target_tlp = str(cfg.get("tlp", "amber")).lower()
        result = [i for i in iocs if str(i.get("tlp", "amber")).lower() == target_tlp]
    elif t == "filter_score":
        result = [i for i in iocs if float(i.get("score") or 0) >= float(cfg.get("min_score", 0))]
    elif t == "dedup":
        seen, result = set(), []
        for i in iocs:
            key = (i.get("value"), i.get("ioc_type"))
            if key not in seen:
                seen.add(key)
                result.append(i)
    else:
        result = iocs

    # Aggiorna lo stato del nodo nel DB
    _update_node_state(flow_id, node.id, result)
    return result


def run_output_node(node, iocs: list, flow_id: str):
    """Persiste gli IOC nel DB, aggiorna lo stato e invia all'output."""
    _persist_iocs(iocs, flow_id, node.id)
    _update_node_state(flow_id, node.id, iocs)
    t, cfg = node.type, node.config
    if t == "siem_out":
        _output_syslog(iocs, cfg)
    elif t == "firewall_out":
        _output_firewall(iocs, cfg)
    logger.info(f"[{node.type}] {len(iocs)} IOC processati e registrati nello stato")


def _persist_iocs(iocs: list, flow_id: str = None, node_id: str = None):
    """Accoda su Redis e processa subito tramite pipeline."""
    from app.core.redis import get_redis
    from app.processing.pipeline import process_raw_queue
    r = get_redis()
    pipe = r.pipeline()
    for ioc in iocs:
        payload = {**ioc}
        if flow_id: payload["flow_id"] = flow_id
        if node_id: payload["node_id"] = node_id
        pipe.rpush("queue:raw_iocs", json.dumps(payload))
    pipe.execute()
    process_raw_queue(batch_size=len(iocs) + 1)


def _update_node_state(flow_id: str, node_id: str, iocs: list):
    """Aggiorna la tabella node_ioc per tracciare cosa è presente in questo nodo."""
    if not iocs or not flow_id:
        return

    from datetime import datetime, timezone, timedelta
    from sqlalchemy.dialects.postgresql import insert

    fid = uuid.UUID(flow_id) if isinstance(flow_id, str) else flow_id
    now = datetime.now(timezone.utc)

    with get_sync_session() as session:
        # 1. Trova gli ID degli IOC per valore/tipo
        values = [i["value"] for i in iocs]
        ioc_map = { (r.value, r.ioc_type): r.id for r in session.query(Ioc.id, Ioc.value, Ioc.ioc_type).filter(Ioc.value.in_(values)).all() }

        # Separiamo IOC attivi e aging: hanno strategie di upsert diverse
        active_objs = []
        aging_objs = []

        for i in iocs:
            ioc_id = ioc_map.get((i["value"], i.get("ioc_type")))
            if not ioc_id:
                continue

            if i.get("_is_aging"):
                expires_at = datetime.fromisoformat(i["_expires_at"])
                aging_objs.append({
                    "flow_id": fid,
                    "node_id": node_id,
                    "ioc_id": ioc_id,
                    "expires_at": expires_at,
                    "source_node_id": i.get("_source_node_id"),
                    "last_seen_at": None
                })
            else:
                expires_at = now + timedelta(days=3650)
                active_objs.append({
                    "flow_id": fid,
                    "node_id": node_id,
                    "ioc_id": ioc_id,
                    "expires_at": expires_at,
                    "source_node_id": i.get("_source_node_id"),
                    "last_seen_at": now
                })

        # IOC ATTIVI: sovrascriviamo expires_at direttamente.
        # Se un IOC torna nella sorgente dopo essere stato in aging, DEVE poter
        # recuperare lo stato attivo (expires_at = 10 anni). func.least() non va
        # usato qui perché impedirebbe il recovery.
        if active_objs:
            stmt = insert(NodeIoc).values(active_objs)
            stmt = stmt.on_conflict_do_update(
                index_elements=["flow_id", "node_id", "ioc_id"],
                set_={
                    "expires_at": stmt.excluded.expires_at,
                    "source_node_id": func.coalesce(stmt.excluded.source_node_id, NodeIoc.source_node_id),
                    "last_seen_at": stmt.excluded.last_seen_at
                }
            )
            session.execute(stmt)

        # IOC AGING: usiamo func.least() per non resettare un countdown già avviato.
        # Se l'IOC è già in aging con un expires_at più vicino, manteniamo quello.
        if aging_objs:
            stmt = insert(NodeIoc).values(aging_objs)
            stmt = stmt.on_conflict_do_update(
                index_elements=["flow_id", "node_id", "ioc_id"],
                set_={
                    "expires_at": func.least(stmt.excluded.expires_at, NodeIoc.expires_at),
                    "source_node_id": func.coalesce(stmt.excluded.source_node_id, NodeIoc.source_node_id),
                    "last_seen_at": NodeIoc.last_seen_at
                }
            )
            session.execute(stmt)

        if active_objs or aging_objs:
            session.commit()


def _output_syslog(iocs: list, cfg: dict):
    import socket
    host = cfg.get("host", "localhost")
    port = int(cfg.get("port", 514))
    proto = cfg.get("proto", "syslog")
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        for ioc in iocs:
            msg = (
                f"CEF:0|ThreatFlow|IOC|1.0|100|Indicator|5|cs1={ioc['value']}"
                if proto == "cef"
                else f"<14>ThreatFlow: ioc={ioc['value']}"
            )
            sock.sendto(msg.encode(), (host, port))
    finally:
        sock.close()


def _output_firewall(iocs: list, cfg: dict):
    import httpx
    url = cfg.get("url", "")
    if not url:
        return
    httpx.post(
        url,
        json={"indicators": iocs},
        headers={"Authorization": f"Bearer {cfg.get('api_key', '')}"},
        timeout=15,
    )
