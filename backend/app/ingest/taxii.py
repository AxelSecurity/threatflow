from .base import BaseConnector, RawIoc

class TaxiiConnector(BaseConnector):
    async def fetch(self) -> list[RawIoc]:
        # Placeholder — richiede taxii2client + stix2
        # TODO: implementare nella prossima iterazione
        return []
