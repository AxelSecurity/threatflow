from dataclasses import dataclass

NODE_CATEGORIES = {
    "http_feed":"ingest","taxii_in":"ingest","misp_in":"ingest","manual_in":"ingest",
    "filter_type":"processing","filter_tlp":"processing","filter_score":"processing","dedup":"processing",
    "export_flat":"output","siem_out":"output","firewall_out":"output","taxii_out":"output",
}

@dataclass
class FlowNode:
    id: str
    type: str
    config: dict

    @property
    def category(self) -> str:
        return NODE_CATEGORIES.get(self.type, "unknown")

@dataclass
class ParsedFlow:
    nodes: dict[str, FlowNode]
    adj:   dict[str, list[str]]

    def ingest_node_ids(self) -> list[str]:
        return [id for id, n in self.nodes.items() if n.category == "ingest"]

    def successors(self, node_id: str) -> list[str]:
        return self.adj.get(node_id, [])

class FlowValidationError(Exception):
    pass

def parse_flow(definition: dict) -> ParsedFlow:
    nodes = {n["id"]: FlowNode(n["id"], n["type"], n.get("config", {}))
             for n in definition.get("nodes", [])}
    adj = {id: [] for id in nodes}
    for c in definition.get("connections", []):
        src, dst = c["from"], c["to"]
        if src not in nodes or dst not in nodes:
            raise FlowValidationError(f"Connection with unknown node: {src}->{dst}")
        adj[src].append(dst)
    _validate(nodes, adj)
    return ParsedFlow(nodes=nodes, adj=adj)

def _validate(nodes, adj):
    if not any(n.category == "ingest" for n in nodes.values()):
        raise FlowValidationError("Flow must have at least one ingest node")
    for id, succs in adj.items():
        if nodes[id].category == "output" and succs:
            raise FlowValidationError(f"Output node {id} cannot have successors")
    visited, in_stack = set(), set()
    def dfs(nid):
        visited.add(nid); in_stack.add(nid)
        for s in adj.get(nid, []):
            if s not in visited: dfs(s)
            elif s in in_stack: raise FlowValidationError(f"Cycle detected at node {s}")
        in_stack.discard(nid)
    for id in nodes:
        if id not in visited: dfs(id)
