import json
import logging
import asyncio
import uuid
from app.ingest.registry import get_connector
from app.db import get_sync_session
from app.models import Source

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


def run_processing_node(node, iocs: list) -> list:
    """Applica filtri o dedup alla lista IOC."""
    t, cfg = node.type, node.config
    if t == "filter_type":
        return [i for i in iocs if i.get("ioc_type") == cfg.get("ioc_type")]
    if t == "filter_tlp":
        return [i for i in iocs if i.get("tlp", "amber") == cfg.get("tlp")]
    if t == "filter_score":
        return [i for i in iocs if float(i.get("score") or 0) >= float(cfg.get("min_score", 0))]
    if t == "dedup":
        seen, result = set(), []
        for i in iocs:
            key = (i.get("value"), i.get("ioc_type"))
            if key not in seen:
                seen.add(key)
                result.append(i)
        return result
    return iocs


def run_output_node(node, iocs: list):
    """Persiste gli IOC nel DB e li invia all'output configurato."""
    _persist_iocs(iocs)
    t, cfg = node.type, node.config
    if t == "export_flat":
        _output_flat(iocs, cfg)
    elif t == "siem_out":
        _output_syslog(iocs, cfg)
    elif t == "firewall_out":
        _output_firewall(iocs, cfg)
    logger.info(f"[{t}] {len(iocs)} IOC inviati")


def _persist_iocs(iocs: list):
    """Accoda su Redis e processa subito tramite pipeline."""
    from app.core.redis import get_redis
    from app.processing.pipeline import process_raw_queue
    r = get_redis()
    pipe = r.pipeline()
    for ioc in iocs:
        pipe.rpush("queue:raw_iocs", json.dumps(ioc))
    pipe.execute()
    process_raw_queue(batch_size=len(iocs) + 1)


def _output_flat(iocs: list, cfg: dict):
    import os
    path = cfg.get("path", "exports/iocs.txt")
    if path.startswith("/exports/"):
        path = f"/app{path}"
    if not path.startswith("/"):
        path = os.path.join("/app", path)
    fmt = cfg.get("format", "txt")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        if fmt == "json":
            json.dump(iocs, f, default=str, indent=2)
        elif fmt == "csv":
            f.write("value,ioc_type,score\n")
            for i in iocs:
                f.write(f"{i['value']},{i.get('ioc_type','')},{i.get('score','')}\n")
        else:
            f.write("\n".join(i["value"] for i in iocs))


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
