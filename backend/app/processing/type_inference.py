import ipaddress, re
from app.processing.validator import _RE_MD5, _RE_SHA1, _RE_SHA256, _RE_DOMAIN, _RE_EMAIL, _RE_URL

def infer_type(value: str) -> str | None:
    v = value.strip()
    try: ipaddress.IPv4Address(v); return "ipv4"
    except: pass
    try: ipaddress.IPv6Address(v); return "ipv6"
    except: pass
    if _RE_SHA256.match(v): return "sha256"
    if _RE_SHA1.match(v):   return "sha1"
    if _RE_MD5.match(v):    return "md5"
    if _RE_URL.match(v):    return "url"
    if _RE_EMAIL.match(v):  return "email"
    if _RE_DOMAIN.match(v): return "domain"
    return None
