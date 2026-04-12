from .base import BaseConnector, RawIoc
class TaxiiConnector(BaseConnector):
    async def fetch(self) -> list[RawIoc]:
        # TODO: implement with taxii2client + stix2
        return []
