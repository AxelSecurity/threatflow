import logging
from celery import shared_task
from app.db import get_sync_session
from app.models.flow import Flow
from .parser import parse_flow, FlowValidationError
from .node_runner import fetch_from_node, run_processing_node, run_output_node

logger = logging.getLogger(__name__)

@shared_task(bind=True, max_retries=3, retry_backoff=True, name="executor.execute_ingest_node")
def execute_ingest_node(self, node_id: str, flow_id: str):
    flow_def = _load_flow(flow_id)
    if not flow_def: return
    try:
        parsed = parse_flow(flow_def)
    except FlowValidationError as e:
        logger.error(f"[flow={flow_id}] Invalid flow: {e}"); return
    node = parsed.nodes.get(node_id)
    if not node: return
    iocs = fetch_from_node(node)
    if not iocs: return
    for chunk in _chunk(iocs, 2000):
        for succ_id in parsed.successors(node_id):
            execute_node.delay(chunk, succ_id, flow_id)

@shared_task(bind=True, max_retries=3, retry_backoff=True, name="executor.execute_node")
def execute_node(self, iocs: list, node_id: str, flow_id: str):
    flow_def = _load_flow(flow_id)
    if not flow_def: return
    try:
        parsed = parse_flow(flow_def)
    except FlowValidationError: return
    node = parsed.nodes.get(node_id)
    if not node: return
    if node.category == "processing":
        result = run_processing_node(node, iocs)
        if not result: return
        for succ_id in parsed.successors(node_id):
            execute_node.delay(result, succ_id, flow_id)
    elif node.category == "output":
        run_output_node(node, iocs)

@shared_task(name="executor.schedule_all_flows")
def schedule_all_flows():
    with get_sync_session() as s:
        flows = s.query(Flow).filter(Flow.active == True).all()
        for flow in flows:
            try:
                parsed = parse_flow(flow.definition)
                for nid in parsed.ingest_node_ids():
                    execute_ingest_node.delay(nid, str(flow.id))
            except FlowValidationError:
                continue

def _load_flow(flow_id):
    with get_sync_session() as s:
        flow = s.get(Flow, flow_id)
        return flow.definition if flow and flow.active else None

def _chunk(lst, size):
    return [lst[i:i+size] for i in range(0, len(lst), size)]
