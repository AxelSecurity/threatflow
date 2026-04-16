from typing import Any
from .base import BaseConnector, RawIoc

class ManualConnector(BaseConnector):
    async def fetch(self) -> list[RawIoc]:
        """
        Restituisce gli indicatori configurati manualmente.
        Cerca in self.config["indicators"] che deve essere una lista di dict:
        {"value": "...", "ioc_type": "...", "score": 90, "tlp": "RED"}
        """
        indicators = self.config.get("indicators", [])
        results = []
        for item in indicators:
            if isinstance(item, dict) and "value" in item:
                results.append(RawIoc(
                    value=item["value"],
                    ioc_type=item.get("ioc_type"),
                    raw_data={
                        "manual_score": item.get("score"),
                        "manual_tlp": item.get("tlp")
                    }
                ))
        return results
