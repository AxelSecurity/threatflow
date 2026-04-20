from dataclasses import dataclass, field

NODE_CATEGORIES = {
    "source_ingest":"ingest",
    "http_feed":"ingest","taxii_in":"ingest","misp_in":"ingest","manual_in":"ingest",
    "filter_type":"processing","filter_tlp":"processing","filter_score":"processing","dedup":"processing","aging":"processing",
    "export_flat":"output","siem_out":"output","firewall_out":"output","taxii_out":"output",
}

NODE_RANKS = {
    "source_ingest": 0, "http_feed": 0, "taxii_in": 0, "misp_in": 0, "manual_in": 0,
    "filter_type": 1, "filter_tlp": 1, "filter_score": 1,
    "dedup": 2,
    "aging": 3,
    "export_flat": 4, "siem_out": 4, "firewall_out": 4, "taxii_out": 4,
}


@dataclass
class FlowNode:
    id: str
    type: str
    config: dict
    label: str | None = None

    @property
    def category(self) -> str:
        return NODE_CATEGORIES.get(self.type, "unknown")

@dataclass
class ParsedFlow:
    nodes: dict
    adj: dict
    warnings: list = field(default_factory=list)


    def find_node(self, identifier: str) -> FlowNode | None:
        """Cerca un nodo per ID o per Label (case insensitive)."""
        # 1. Ricerca per ID esatto
        if identifier in self.nodes:
            return self.nodes[identifier]
        
        # 2. Ricerca per Label
        for node in self.nodes.values():
            if node.label and node.label.lower() == identifier.lower():
                return node
        
        return None

    def ingest_node_ids(self):
        return [id for id, n in self.nodes.items() if n.category == "ingest"]

    def successors(self, node_id: str):
        return self.adj.get(node_id, [])

    def predecessors(self, node_id: str):
        """Ritorna la lista dei nodi che puntano a questo node_id."""
        return [nid for nid, succs in self.adj.items() if node_id in succs]

class FlowValidationError(Exception):
    pass

def parse_flow(definition: dict) -> ParsedFlow:
    nodes = {n["id"]: FlowNode(n["id"], n["type"], n.get("config", {}), n.get("label"))
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

    for id, succs in adj.items():
        if nodes[id].category == "output" and succs:
            raise FlowValidationError(f"Output node {id} cannot have successors")
    visited, stack = set(), set()
    def dfs(nid):
        visited.add(nid); stack.add(nid)
        for s in adj.get(nid, []):
            if s not in visited: dfs(s)
            elif s in stack: raise FlowValidationError(f"Cycle at node {s}")
        stack.discard(nid)
    for id in nodes:
        if id not in visited: dfs(id)

def validate_flow_structure(parsed: ParsedFlow) -> list:
    """Verifica la struttura del flow e ritorna una lista di warning non bloccanti."""
    warnings = []
    
    for src_id, successors in parsed.adj.items():
        src_node = parsed.nodes[src_id]
        src_rank = NODE_RANKS.get(src_node.type, 1) # Default 1 if unknown process

        for dst_id in successors:
            dst_node = parsed.nodes[dst_id]
            dst_rank = NODE_RANKS.get(dst_node.type, 1)

            # Regola 1: Rank ascendente (Ingest -> Filter -> Dedup -> Aging -> Output)
            if src_rank > dst_rank:
                warnings.append({
                    "node_id": dst_id,
                    "type": "RANK_VIOLATION",
                    "message": f"Ordine non ottimale: {src_node.type} non dovrebbe precedere {dst_node.type}."
                })
            
            # Regola 2: Aging deve essere l'ultimo processing
            if src_node.type == "aging" and dst_node.category == "processing":
                 warnings.append({
                    "node_id": dst_id,
                    "type": "POST_AGING_PROCESSING",
                    "message": "I filtri e la deduplica dovrebbero precedere l'Aging per evitare sprechi di risorse."
                })
            
            # Regola 3: Ingest non dovrebbe avere predecessori (già implicitamente coperto da rank 0)
            # Regola 4: Output non dovrebbe avere successori (coperto da _validate bloccante)
            pass

    # Regola 5: Presenza di Aging (Consigliato per lifecycle)
    if not any(n.type == "aging" for n in parsed.nodes.values()):
        # Cerchiamo se c'è almeno un output (se non c'è output il suggerimento è inutile)
        if any(n.category == "output" for n in parsed.nodes.values()):
            warnings.append({
                "node_id": "flow",
                "type": "MISSING_AGING",
                "message": "Consiglio: Aggiungi un nodo Aging prima dell'Output per gestire la scadenza degli IOC."
            })

    # Regola 6: Presenza di Ingest
    if not any(n.category == "ingest" for n in parsed.nodes.values()):
         warnings.append({
            "node_id": "flow",
            "type": "MISSING_INGEST",
            "message": "Flusso incompleto: Aggiungi almeno un nodo di Ingest per iniziare la raccolta dati."
        })


    return warnings


