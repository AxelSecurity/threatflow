from .http import HttpConnector
from .taxii import TaxiiConnector

REGISTRY = {
    # nomi usati dal frontend
    "http_feed": HttpConnector,
    "taxii_in":  TaxiiConnector,
    # alias legacy
    "http":  HttpConnector,
    "csv":   HttpConnector,
    "taxii": TaxiiConnector,
}

def get_connector(feed_type: str, config: dict):
    cls = REGISTRY.get(feed_type)
    if not cls:
        raise ValueError(f"Connector non disponibile per il tipo '{feed_type}'. "
                         f"Tipi supportati: {', '.join(REGISTRY)}")
    return cls(config)
