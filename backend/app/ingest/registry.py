from .http import HttpConnector
from .taxii import TaxiiConnector

CONNECTOR_REGISTRY = {
    "http":  HttpConnector,
    "csv":   HttpConnector,
    "taxii": TaxiiConnector,
}

def get_connector(feed_type: str, config: dict):
    cls = CONNECTOR_REGISTRY.get(feed_type)
    if not cls:
        raise ValueError(f"Connettore non trovato: {feed_type}")
    return cls(config)
