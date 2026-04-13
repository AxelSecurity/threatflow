import logging
import uuid as uuid_module
from app.core.celery_app import app as celery_app
from app.db import get_sync_session
from app.models.flow import Flow
from .parser import parse_flow, FlowValidationError
from .node_runner import fetch_from_node, run_processing_node, run_output_node

logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────

def _log(flow_id: str, level: str, message: str, meta: dict | None = None):
    """Scrive un entry nel log del flow — non propaga eccezioni."""
    try:
        from app.models.flow_log import FlowLog
        with get_sync_session() as session:
            session.add(FlowLog(
                flow_id=flow_id,
                level=level,
                message=message,
                meta=meta or {},
            ))
            session.commit()
    except Exception as e:
        logger.error(f"[flow_log] Impossibile scrivere il log: {e}")


def _load_flow(flow_id: str, force: bool = False) -> dict | None:
    """
    Carica la definition del flow.
    force=True ignora il flag active (per run manuali).
    """
    try:
        fid = uuid_module.UUID(flow_id) if isinstance(flow_id, str) else flow_id
        with get_sync_session() as s:
            flow = s.get(Flow, fid)
            if not flow:
                logger.warning(f"[executor] Flow {flow_id} non trovato")
                return None
            if not force and not flow.active:
                return None
            return flow.definition
    except Exception as e:
        logger.error(f"[executor] _load_flow error: {e}")
        return None


def _chunk(lst: list, size: int) -> list:
    return [lst[i:i + size] for i in range(0, len(lst), size)]


# ── Celery tasks ────────────────────────────────────────────────────────────

@celery_app.task(bind=True, max_retries=3, retry_backoff=True)
def execute_ingest_node(self, node_id: str, flow_id: str, force: bool = False):
    """Esegue un nodo ingest: recupera IOC e coda i successori."""
    flow_def = _load_flow(flow_id, force=force)
    if not flow_def:
        return

    try:
        parsed = parse_flow(flow_def)
    except FlowValidationError as e:
        _log(flow_id, "ERROR", f"Flow non valido: {e}")
        return

    node = parsed.nodes.get(node_id)
    if not node:
        _log(flow_id, "ERROR", f"Nodo {node_id} non trovato nel flow")
        return

    _log(flow_id, "INFO",
         f"Avvio nodo ingest [{node.type}]",
         {"node_id": node_id})

    try:
        iocs = fetch_from_node(node)
    except Exception as exc:
        _log(flow_id, "ERROR",
             f"Fetch fallito per nodo {node.type}: {exc}",
             {"node_id": node_id})
        raise self.retry(exc=exc)

    if not iocs:
        _log(flow_id, "WARNING",
             f"Nessun IOC recuperato dal nodo [{node.type}]",
             {"node_id": node_id})
        return

    _log(flow_id, "INFO",
         f"Nodo [{node.type}]: {len(iocs)} IOC recuperati",
         {"node_id": node_id, "count": len(iocs)})

    successors = parsed.successors(node_id)
    if not successors:
        _log(flow_id, "WARNING",
             f"Nodo [{node_id}] non ha successori — aggiunta diretta al DB",
             {"node_id": node_id})
        # Nessun successore: persisti direttamente gli IOC nel DB
        from .node_runner import _persist_iocs
        _persist_iocs(iocs)
        return

    for chunk in _chunk(iocs, 2000):
        for succ_id in successors:
            execute_node.delay(chunk, succ_id, flow_id)


@celery_app.task(bind=True, max_retries=3, retry_backoff=True)
def execute_node(self, iocs: list, node_id: str, flow_id: str):
    """Esegue un nodo processing o output con la lista IOC ricevuta."""
    # force=True: i nodi intermedi devono sempre eseguire
    flow_def = _load_flow(flow_id, force=True)
    if not flow_def:
        return

    try:
        parsed = parse_flow(flow_def)
    except FlowValidationError:
        return

    node = parsed.nodes.get(node_id)
    if not node:
        return

    if node.category == "processing":
        try:
            result = run_processing_node(node, iocs)
        except Exception as exc:
            _log(flow_id, "ERROR",
                 f"Errore nodo processing [{node.type}]: {exc}",
                 {"node_id": node_id})
            raise self.retry(exc=exc)

        _log(flow_id, "INFO",
             f"Nodo [{node.type}]: {len(result)}/{len(iocs)} IOC dopo filtro",
             {"node_id": node_id, "in": len(iocs), "out": len(result)})

        if not result:
            return

        for succ_id in parsed.successors(node_id):
            execute_node.delay(result, succ_id, flow_id)

    elif node.category == "output":
        try:
            run_output_node(node, iocs)
            _log(flow_id, "INFO",
                 f"Nodo output [{node.type}]: {len(iocs)} IOC inviati",
                 {"node_id": node_id, "count": len(iocs)})
        except Exception as exc:
            _log(flow_id, "ERROR",
                 f"Errore nodo output [{node.type}]: {exc}",
                 {"node_id": node_id})
            raise self.retry(exc=exc)


@celery_app.task
def schedule_all_flows():
    """Beat task: esegue tutti i flow attivi."""
    with get_sync_session() as s:
        flows = s.query(Flow).filter(Flow.active == True).all()
        for flow in flows:
            try:
                parsed = parse_flow(flow.definition)
                for nid in parsed.ingest_node_ids():
                    execute_ingest_node.delay(nid, str(flow.id), False)
            except FlowValidationError:
                continue
