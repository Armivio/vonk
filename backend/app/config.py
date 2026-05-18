from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://vonk:vonk@postgres:5432/vonk"
    redis_url: str = "redis://redis:6379/0"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    jwt_secret: str = "dev-secret-change-me"
    cors_origins: str = "http://localhost:3000"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
