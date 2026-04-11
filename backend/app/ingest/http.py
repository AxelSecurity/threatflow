import csv, json, io, httpx
from .base import BaseConnector, RawIoc

class HttpConnector(BaseConnector):
    async def fetch(self) -> list[RawIoc]:
        url     = self.config["url"]
        fmt     = self.config.get("format", "txt")
        comment = self.config.get("comment", "#")
        timeout = self.config.get("timeout", 30)
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.get(url, follow_redirects=True)
            r.raise_for_status()
            text = r.text
        if fmt == "txt":   return self._parse_txt(text, comment)
        if fmt == "csv":   return self._parse_csv(text, comment)
        if fmt == "jsonl": return self._parse_jsonl(text)
        raise ValueError(f"Formato non supportato: {fmt}")

    def _parse_txt(self, text, comment):
        return [RawIoc(value=l.strip(), ioc_type=self.config.get("ioc_type"))
                for l in text.splitlines() if l.strip() and not l.startswith(comment)]

    def _parse_csv(self, text, comment):
        delimiter = self.config.get("delimiter", ",")
        value_col = self.config.get("value_col", 0)
        ioc_type  = self.config.get("ioc_type")
        results   = []
        reader = csv.DictReader(io.StringIO(text), delimiter=delimiter)
        for row in reader:
            first = next(iter(row.values()), "")
            if first.startswith(comment): continue
            value = list(row.values())[value_col] if isinstance(value_col, int) else row.get(value_col, "")
            if value:
                results.append(RawIoc(value=value.strip(), ioc_type=ioc_type, raw_data=dict(row)))
        return results

    def _parse_jsonl(self, text):
        value_key = self.config.get("value_key", "value")
        results = []
        for line in text.splitlines():
            if not line.strip(): continue
            try:
                obj = json.loads(line)
                if v := obj.get(value_key):
                    results.append(RawIoc(value=str(v), ioc_type=self.config.get("ioc_type"), raw_data=obj))
            except json.JSONDecodeError: continue
        return results
