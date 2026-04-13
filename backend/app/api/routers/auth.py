from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from app.api.deps import get_db, get_current_user, RequireAdmin
from app.core.security import hash_password, verify_password, create_access_token
from app.models import User, UserRole

router = APIRouter(prefix="/auth", tags=["Auth"])


# ── Schemas ───────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email:        str
    display_name: str
    password:     str
    role:         UserRole = UserRole.ANALYST


class UserResponse(BaseModel):
    id:           UUID
    email:        str
    display_name: str
    role:         str
    active:       bool
    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type:   str = "bearer"
    user:         UserResponse


# ── Endpoints ─────────────────────────────────────────────────────────

@router.post("/register", response_model=UserResponse, status_code=201)
def register(payload: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
    """
    Primo utente registrato diventa automaticamente admin.
    I successivi sono analyst di default (modificabile da un admin).
    """
    if db.query(User).filter(User.email == payload.email.lower()).first():
        raise HTTPException(409, "Email già registrata")

    is_first = db.query(User).count() == 0
    role     = UserRole.ADMIN if is_first else payload.role

    user = User(
        email        = payload.email.lower(),
        display_name = payload.display_name,
        hashed_pw    = hash_password(payload.password),
        role         = role.value,
        active       = True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(
    form: Annotated[OAuth2PasswordRequestForm, Depends()],
    db:   Annotated[Session, Depends(get_db)],
):
    user = db.query(User).filter(User.email == form.username.lower()).first()
    if not user or not verify_password(form.password, user.hashed_pw):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenziali non valide",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.active:
        raise HTTPException(403, "Account disabilitato")

    token = create_access_token(str(user.id), user.role)
    return TokenResponse(access_token=token, user=UserResponse.model_validate(user))


@router.get("/me", response_model=UserResponse)
def me(current: Annotated[User, Depends(get_current_user)]):
    return current


@router.get("/users", response_model=list[UserResponse], dependencies=[RequireAdmin])
def list_users(db: Annotated[Session, Depends(get_db)]):
    return db.query(User).all()


@router.patch("/users/{user_id}/role", response_model=UserResponse, dependencies=[RequireAdmin])
def change_role(
    user_id: UUID,
    role:    UserRole,
    db:      Annotated[Session, Depends(get_db)],
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Utente non trovato")
    user.role = role.value
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/toggle", response_model=UserResponse, dependencies=[RequireAdmin])
def toggle_user(user_id: UUID, db: Annotated[Session, Depends(get_db)]):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Utente non trovato")
    user.active = not user.active
    db.commit()
    db.refresh(user)
    return user
