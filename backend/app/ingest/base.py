from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

@dataclass
class RawIoc:
    value: str
    ioc_type: str | None = None
    raw_data: dict[str, Any] | None = None

class BaseConnector(ABC):
    def __init__(self, config: dict[str, Any]):
        self.config = config

    @abstractmethod
    async def fetch(self) -> list[RawIoc]: ...
