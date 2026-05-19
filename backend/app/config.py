from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://vonk:vonk@postgres:5432/vonk"
    redis_url: str = "redis://redis:6379/0"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    jwt_secret: str = "dev-secret-change-me"
    cors_origins: str = "http://localhost:3000"

    # OTP delivery — email (SMTP) and SMS (Twilio). All optional.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_pass: str = ""
    smtp_from: str = "noreply@vonk.app"
    twilio_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def email_configured(self) -> bool:
        return bool(self.smtp_host and self.smtp_user and self.smtp_pass)

    @property
    def sms_configured(self) -> bool:
        return bool(self.twilio_sid and self.twilio_auth_token and self.twilio_phone_number)


settings = Settings()
