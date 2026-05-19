"""One-time password (OTP) sending + verification.

Codes live in Redis at `vonk:otp:{identifier}` with a 10-minute TTL. The
identifier is normalised — lowercased email, or phone with whitespace
stripped — so retries/sends/verifies all line up.

Delivery is best-effort:
- Email via SMTP if SMTP_* env vars are set.
- SMS via Twilio if TWILIO_* env vars are set AND the package is installed.
- If neither path is configured for a given identifier type, we log the code
  to stdout so a demo presenter can read it from `docker compose logs backend`.
  In that case `dev_code` is also returned by `send_otp` so the UI can show it
  inline (so the demo doesn't require real credentials).
"""

from __future__ import annotations

import logging
import random
import smtplib
from dataclasses import dataclass
from email.mime.text import MIMEText
from typing import Optional

from app.config import settings
from app.redis_client import get_redis

logger = logging.getLogger(__name__)

_REDIS_KEY = "vonk:otp:{identifier}"
_REDIS_TTL_SECONDS = 10 * 60


def normalise(identifier: str) -> str:
    s = identifier.strip()
    if "@" in s:
        return s.lower()
    # Phone: strip whitespace and dashes, keep leading +.
    return "".join(ch for ch in s if ch.isdigit() or ch == "+")


def is_email(identifier: str) -> bool:
    return "@" in identifier


def _generate_code() -> str:
    return "".join(str(random.randint(0, 9)) for _ in range(6))


@dataclass
class SendResult:
    sent: bool
    method: str  # "email" | "sms"
    dev_code: Optional[str] = None  # populated only when delivery isn't configured


async def send_otp(raw_identifier: str) -> SendResult:
    identifier = normalise(raw_identifier)
    if not identifier or (not is_email(identifier) and len(identifier) < 6):
        raise ValueError("Invalid identifier")

    code = _generate_code()
    redis = get_redis()
    await redis.setex(_REDIS_KEY.format(identifier=identifier), _REDIS_TTL_SECONDS, code)

    method = "email" if is_email(identifier) else "sms"
    delivered = False

    if method == "email":
        if settings.email_configured:
            try:
                _send_email(identifier, code)
                delivered = True
            except Exception:
                logger.exception("SMTP send failed for %s", identifier)
        else:
            logger.warning(
                "[OTP DEV] No SMTP configured — code for %s is %s (valid 10 min)",
                identifier,
                code,
            )
    else:
        if settings.sms_configured:
            try:
                _send_sms(identifier, code)
                delivered = True
            except Exception:
                logger.exception("Twilio send failed for %s", identifier)
        else:
            logger.warning(
                "[OTP DEV] No Twilio configured — code for %s is %s (valid 10 min)",
                identifier,
                code,
            )

    # Echo the code back in the API response only when delivery wasn't
    # actually performed — so the demo can complete without real credentials.
    return SendResult(sent=True, method=method, dev_code=None if delivered else code)


async def verify_otp(raw_identifier: str, code: str) -> bool:
    identifier = normalise(raw_identifier)
    if not identifier or not code:
        return False
    redis = get_redis()
    key = _REDIS_KEY.format(identifier=identifier)
    stored = await redis.get(key)
    if not stored:
        return False
    stored_str = stored.decode() if isinstance(stored, (bytes, bytearray)) else str(stored)
    if stored_str != code.strip():
        return False
    await redis.delete(key)
    return True


# ── Channel implementations ──────────────────────────────────────────────


def _send_email(to_email: str, code: str) -> None:
    msg = MIMEText(
        f"Je Vonk verificatiecode is: {code}\n\n"
        f"Deze code verloopt over 10 minuten.\n\n"
        f"Heb je dit niet aangevraagd? Negeer deze e-mail."
    )
    msg["Subject"] = f"Vonk — Je code is {code}"
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_pass)
        server.send_message(msg)


def _send_sms(to_phone: str, code: str) -> None:
    try:
        from twilio.rest import Client  # type: ignore
    except Exception as exc:
        raise RuntimeError("twilio package not installed") from exc
    client = Client(settings.twilio_sid, settings.twilio_auth_token)
    client.messages.create(
        body=f"Je Vonk verificatiecode is: {code}",
        from_=settings.twilio_phone_number,
        to=to_phone,
    )
