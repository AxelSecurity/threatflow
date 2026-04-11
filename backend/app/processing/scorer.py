from dataclasses import dataclass

@dataclass
class ScoreContext:
    source_count: int
    feed_weight: float
    ioc_type: str

_TYPE_BASE = {
    "sha256": 70, "sha1": 65, "md5": 60,
    "ipv4": 50,   "ipv6": 50, "domain": 55,
    "url": 55,    "email": 45,
}

def compute_score(ctx: ScoreContext) -> float:
    base  = _TYPE_BASE.get(ctx.ioc_type, 50)
    boost = min(ctx.source_count - 1, 5) * 2 * ctx.feed_weight
    return min(round(base + boost, 1), 95.0)
