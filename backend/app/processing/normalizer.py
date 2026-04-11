from urllib.parse import urlparse, urlunparse
import ipaddress

def normalize(value: str, ioc_type: str) -> str:
    v = value.strip()
    if ioc_type in ("domain", "email"): return v.lower()
    if ioc_type == "url":
        p = urlparse(v)
        return urlunparse(p._replace(scheme=p.scheme.lower(), netloc=p.netloc.lower()))
    if ioc_type in ("md5", "sha1", "sha256"): return v.lower()
    if ioc_type in ("ipv4", "ipv6"):
        try: return str(ipaddress.ip_address(v))
        except: return v
    return v
