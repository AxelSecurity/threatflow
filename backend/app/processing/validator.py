import re, ipaddress
from dataclasses import dataclass
from enum import Enum

class ValidationError(Enum):
    EMPTY="empty_value"; INVALID_IP="invalid_ip"; INVALID_DOMAIN="invalid_domain"
    INVALID_URL="invalid_url"; INVALID_HASH="invalid_hash"
    INVALID_EMAIL="invalid_email"; UNKNOWN_TYPE="unknown_type"

@dataclass
class ValidationResult:
    valid: bool
    error: ValidationError | None = None
    detail: str | None = None

_RE_DOMAIN  = re.compile(r"^(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$")
_RE_URL     = re.compile(r"^https?://", re.IGNORECASE)
_RE_EMAIL   = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_RE_MD5     = re.compile(r"^[a-fA-F0-9]{32}$")
_RE_SHA1    = re.compile(r"^[a-fA-F0-9]{40}$")
_RE_SHA256  = re.compile(r"^[a-fA-F0-9]{64}$")

class IocValidator:
    def validate(self, value: str, ioc_type: str) -> ValidationResult:
        if not value or not value.strip():
            return ValidationResult(False, ValidationError.EMPTY)
        dispatch = {
            "ipv4": self._v_ipv4, "ipv6": self._v_ipv6,
            "domain": self._v_domain, "url": self._v_url,
            "md5": self._v_md5, "sha1": self._v_sha1, "sha256": self._v_sha256,
            "email": self._v_email,
        }
        fn = dispatch.get(ioc_type)
        if not fn: return ValidationResult(False, ValidationError.UNKNOWN_TYPE, ioc_type)
        return fn(value.strip())

    def _v_ipv4(self, v):
        try:
            addr = ipaddress.IPv4Address(v)
            if addr.is_loopback or addr.is_unspecified:
                return ValidationResult(False, ValidationError.INVALID_IP, "loopback/unspecified")
            return ValidationResult(True)
        except: return ValidationResult(False, ValidationError.INVALID_IP, v)

    def _v_ipv6(self, v):
        try:
            addr = ipaddress.IPv6Address(v)
            if addr.is_loopback or addr.is_unspecified:
                return ValidationResult(False, ValidationError.INVALID_IP, "loopback/unspecified")
            return ValidationResult(True)
        except: return ValidationResult(False, ValidationError.INVALID_IP, v)

    def _v_domain(self, v):
        v2 = v.lstrip("*.")
        if len(v2) > 253: return ValidationResult(False, ValidationError.INVALID_DOMAIN, "too long")
        if not _RE_DOMAIN.match(v2): return ValidationResult(False, ValidationError.INVALID_DOMAIN, v)
        return ValidationResult(True)

    def _v_url(self, v):
        if not _RE_URL.match(v): return ValidationResult(False, ValidationError.INVALID_URL, "missing schema")
        return ValidationResult(True)

    def _v_md5(self, v):
        return ValidationResult(True) if _RE_MD5.match(v) else ValidationResult(False, ValidationError.INVALID_HASH, "expected 32 hex")

    def _v_sha1(self, v):
        return ValidationResult(True) if _RE_SHA1.match(v) else ValidationResult(False, ValidationError.INVALID_HASH, "expected 40 hex")

    def _v_sha256(self, v):
        return ValidationResult(True) if _RE_SHA256.match(v) else ValidationResult(False, ValidationError.INVALID_HASH, "expected 64 hex")

    def _v_email(self, v):
        return ValidationResult(True) if _RE_EMAIL.match(v) else ValidationResult(False, ValidationError.INVALID_EMAIL, v)
