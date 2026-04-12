import os
from datetime import datetime, timezone, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext

SECRET_KEY  = os.getenv("SECRET_KEY", "change-me-in-production-use-openssl-rand-hex-32")
ALGORITHM   = "HS256"
ACCESS_TTL  = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_access_token(subject: str, role: str) -> str:
    expire  = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TTL)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Raises JWTError on invalid/expired token."""
    return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
