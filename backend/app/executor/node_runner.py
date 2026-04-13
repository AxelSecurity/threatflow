import json, logging, asyncio, uuid
from app.ingest.registry import get_connector
from app.db import get_sync_session
from app.models import Source

logger = logging.getLogger(__name__)

def fetch_from_node(node) -> list:
    if node.type == "source_ingest":
        source_id = node.config.get("source_id")
        if not source_id: return []
        from app.models.ioc import Ioc, IocSource
        with get_sync_session() as session:
            # Query IOCs linked to this source via IocSource
            results = (session.query(Ioc)
                      .join(IocSource)
                      .filter(IocSource.source_id == uuid.UUID(source_id))
                      .all())
            return [{"value": r.value, "ioc_type": r.ioc_type, "score": r.score, "tlp": r.tlp} for r in results]
    
    # Legacy/Direct fetch for other ingest types (if they still exist as manual config)
    feed_type = "taxii" if node.type == "taxii_in" else "misp" if node.type == "misp_in" else "http"
    config = {**node.config}
    connector = get_connector(feed_type, config)
    raw_iocs  = asyncio.run(connector.fetch())
    return [{"value": r.value, "ioc_type": r.ioc_type, "raw_data": r.raw_data} for r in raw_iocs]

def run_processing_node(node, iocs: list) -> list:
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
            if key not in seen: seen.add(key); result.append(i)
        return result
    return iocs

def run_output_node(node, iocs: list):
    _persist_iocs(iocs)
    t, cfg = node.type, node.config
    if t == "export_flat":   _output_flat(iocs, cfg)
    elif t == "siem_out":    _output_syslog(iocs, cfg)
    elif t == "firewall_out": _output_firewall(iocs, cfg)
    logger.info(f"[{t}] {len(iocs)} IOC dispatched")

def _persist_iocs(iocs):
    from app.core.redis import get_redis
    r = get_redis()
    pipe = r.pipeline()
    for ioc in iocs:
        pipe.rpush("queue:raw_iocs", json.dumps(ioc))
    pipe.execute()

def _output_flat(iocs, cfg):
    import os
    path = cfg.get("path", "exports/iocs.txt")
    # Normalize: if path starts with /exports/, remap to /app/exports/ for shared volume
    if path.startswith("/exports/"):
        path = f"/app{path}"
    # If path is relative, make it relative to /app/
    if not path.startswith("/"):
        path = os.path.join("/app", path)
    
    fmt  = cfg.get("format", "txt")
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    with open(path, "w") as f:
        if fmt == "json": json.dump(iocs, f, default=str, indent=2)
        elif fmt == "csv":
            f.write("value,ioc_type,score\n")
            for i in iocs: f.write(f"{i['value']},{i.get('ioc_type','')},{i.get('score','')}\n")
        else:
            content = "\n".join(i["value"] for i in iocs)
            f.write(content if content else "") # Assicura che il file venga creato/pulito

def _output_syslog(iocs, cfg):
    import socket
    host, port = cfg.get("host", "localhost"), int(cfg.get("port", 514))
    proto = cfg.get("proto", "syslog")
    sock  = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    for ioc in iocs:
        msg = (f"CEF:0|ThreatFlow|IOC|1.0|100|Indicator|5|cs1={ioc['value']}"
               if proto == "cef" else f"<14>ThreatFlow: ioc={ioc['value']}")
        sock.sendto(msg.encode(), (host, port))
    sock.close()

def _output_firewall(iocs, cfg):
    import httpx
    url = cfg.get("url", "")
    if not url: return
    httpx.post(url, json={"indicators": iocs},
               headers={"Authorization": f"Bearer {cfg.get('api_key', '')}"}, timeout=15)
