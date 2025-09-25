from pydantic import BaseSettings, PostgresDsn


class Settings(BaseSettings):
    app_name: str = "auth"
    postgres_dsn: PostgresDsn
    secret_key: str
    access_token_expire_minutes: int = 30

    class Config:
        env_file = ".env"


settings = Settings()
