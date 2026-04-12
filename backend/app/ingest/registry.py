from .http import HttpConnector
from .taxii import TaxiiConnector

REGISTRY = {"http": HttpConnector, "csv": HttpConnector, "taxii": TaxiiConnector}

def get_connector(feed_type: str, config: dict):
    cls = REGISTRY.get(feed_type)
    if not cls:
        raise ValueError(f"Unknown connector: {feed_type}")
    return cls(config)
