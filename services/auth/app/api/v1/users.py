from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import db
from app.models.user import User
from app.schemas.user import UserCreate, UserRead
from app.core.security import pwd_context, create_access_token

router = APIRouter(prefix="/users", tags=["users"])


def get_db():
    with db.SessionLocal() as session:
        yield session


@router.post("/", response_model=UserRead)
def create_user(user: UserCreate, session: Session = Depends(get_db)):
    if session.query(User).filter_by(email=user.email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    db_user = User(
        email=user.email,
        hashed_password=pwd_context.hash(user.password),
    )
    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user


@router.post("/token")
def login(user: UserCreate, session: Session = Depends(get_db)):
    db_user = session.query(User).filter_by(email=user.email).first()
    if not db_user or not pwd_context.verify(user.password, db_user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect credentials")
    token = create_access_token(str(db_user.id))
    return {"access_token": token, "token_type": "bearer"}
