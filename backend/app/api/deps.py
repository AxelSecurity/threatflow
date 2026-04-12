from typing import Annotated
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session
from app.db import SessionLocal
from app.core.security import decode_token
from app.models.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
    db:    Annotated[Session, Depends(get_db)],
) -> User:
    credentials_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token non valido o scaduto",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exc
    except JWTError:
        raise credentials_exc

    user = db.get(User, user_id)
    if not user or not user.active:
        raise credentials_exc
    return user


def require_role(*roles: UserRole):
    def checker(current: Annotated[User, Depends(get_current_user)]) -> User:
        if current.role not in [r.value for r in roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Ruolo richiesto: {[r.value for r in roles]}",
            )
        return current
    return checker


RequireAdmin   = Depends(require_role(UserRole.ADMIN))
RequireAnalyst = Depends(require_role(UserRole.ADMIN, UserRole.ANALYST))
RequireAny     = Depends(get_current_user)
