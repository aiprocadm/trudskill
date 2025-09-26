from fastapi import FastAPI
from app.api.v1.users import router as users_router

app = FastAPI(title="Auth Service", openapi_url="/api/v1/openapi.json")
app.include_router(users_router, prefix="/api/v1")
