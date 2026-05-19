"""Vonk MCP server — exposes core Vonk functionality as MCP tools.

Runs on port 8001, speaks SSE. External AI agents (WhatsApp bots,
ElevenLabs voice agents) connect here instead of hardcoding HTTP calls
against the Vonk backend.

Every tool is a thin wrapper around an existing backend endpoint —
keeping the contract narrow on purpose so the same vocabulary surfaces
across every channel.
"""

import json
import os
import httpx
import os

from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "Vonk",
    host=os.environ.get("FASTMCP_HOST", "127.0.0.1"),
    port=int(os.environ.get("FASTMCP_PORT", 8000)),
)

VONK_API = os.environ.get("VONK_API", "http://localhost:8000")


@mcp.tool()
async def chat_with_vonk(
    message: str,
    phone: str = None,
    user_name: str = None,
    session_id: str = None,
    channel: str = "whatsapp",
    latitude: float = 51.9225,
    longitude: float = 4.4792,
) -> str:
    """
    Have a conversation with Vonk's AI assistant. Send a message and get a
    warm, helpful response. The AI will ask 3-5 questions to understand what
    kind of social connection the person is looking for, then suggest matching
    vonken (micro-gatherings) nearby.

    Use this for the main conversation flow — it handles everything from
    first contact to matching.

    Args:
        message: What the person said
        phone: Their phone number (for identification across messages)
        user_name: Their name (if known)
        session_id: Unique ID for this conversation thread (generate one per chat/call)
        channel: "whatsapp" or "voice"
        latitude: User's latitude (default: Rotterdam center)
        longitude: User's longitude (default: Rotterdam center)
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        payload = {
            "channel": channel,
            "phone": phone or "",
            "user_name": user_name or "",
            "message": message,
            "session_id": session_id or "",
            "location": {"lat": latitude, "lon": longitude},
        }
        response = await client.post(
            f"{VONK_API}/api/channels/{channel}/incoming",
            json=payload,
        )
        if response.status_code == 200:
            data = response.json()
            result = {"reply": data.get("assistant_message") or data.get("reply", "")}
            if data.get("session_id"):
                result["session_id"] = data["session_id"]
            if data.get("done"):
                result["done"] = data["done"]
            if data.get("gloed"):
                result["gloed"] = data["gloed"]
            if data.get("matches"):
                result["matches"] = data["matches"]
            return json.dumps(result, indent=2, default=str)
        else:
            return json.dumps(
                {"error": f"API returned {response.status_code}", "detail": response.text}
            )


@mcp.tool()
async def discover_vonken(
    latitude: float = 51.9225,
    longitude: float = 4.4792,
    radius_km: float = 5.0,
    category: str = None,
) -> str:
    """
    Find vonken (micro-gatherings) happening nearby. Returns a list of
    upcoming vonken with title, location, time, spots left, and category.

    Args:
        latitude: Search center latitude (default: Rotterdam)
        longitude: Search center longitude (default: Rotterdam)
        radius_km: Search radius in kilometers (default: 5)
        category: Filter by category — "social", "active", "creative", "learning", "quiet", "food" (optional)
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        params = {
            "lat": latitude,
            "lon": longitude,
            "radius_km": radius_km,
        }
        if category:
            params["category"] = category
        response = await client.get(
            f"{VONK_API}/api/vonk/discover",
            params=params,
        )
        if response.status_code == 200:
            vonken = response.json()
            results = []
            iterable = vonken if isinstance(vonken, list) else vonken.get("vonken", [])
            for v in iterable:
                max_p = v.get("max_participants") or 0
                participants = v.get("participants_count") or 0
                results.append(
                    {
                        "id": v.get("id"),
                        "title": v.get("title"),
                        "location": v.get("location_name"),
                        "time": v.get("scheduled_at"),
                        "category": v.get("category"),
                        "spots_left": max(0, max_p - participants),
                        "distance_km": v.get("distance_km"),
                    }
                )
            return json.dumps(results, indent=2, default=str)
        else:
            return json.dumps({"error": f"API returned {response.status_code}"})


@mcp.tool()
async def join_vonk(
    vonk_id: str,
    user_id: str = None,
    phone: str = None,
    user_name: str = None,
) -> str:
    """
    Join a vonk (micro-gathering). The person is added to the participant list.

    Args:
        vonk_id: The ID of the vonk to join
        user_id: The user's ID (if known from web)
        phone: The user's phone number (if from WhatsApp/voice — will find or create user)
        user_name: The user's name (used only when creating a new user from phone)
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {}
        if user_id:
            headers["X-User-Id"] = user_id

        payload = {}
        if phone:
            payload["phone"] = phone
        if user_name:
            payload["user_name"] = user_name

        response = await client.post(
            f"{VONK_API}/api/vonk/{vonk_id}/join",
            json=payload,
            headers=headers,
        )
        if response.status_code == 200:
            return json.dumps({"success": True, "message": "Joined the vonk!"})
        else:
            return json.dumps({"success": False, "error": response.text})


@mcp.tool()
async def leave_vonk(vonk_id: str, user_id: str = None, phone: str = None) -> str:
    """
    Leave a vonk you previously joined.

    Args:
        vonk_id: The ID of the vonk to leave
        user_id: The user's ID
        phone: The user's phone number
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {}
        if user_id:
            headers["X-User-Id"] = user_id

        payload = {}
        if phone:
            payload["phone"] = phone

        response = await client.post(
            f"{VONK_API}/api/vonk/{vonk_id}/leave",
            json=payload,
            headers=headers,
        )
        if response.status_code in (200, 204):
            return json.dumps({"success": True, "message": "Left the vonk"})
        else:
            return json.dumps({"success": False, "error": response.text})


@mcp.tool()
async def get_vonk_details(vonk_id: str) -> str:
    """
    Get full details about a specific vonk — title, description, location,
    time, participants, and whether there are spots left.

    Args:
        vonk_id: The ID of the vonk
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(f"{VONK_API}/api/vonk/{vonk_id}")
        if response.status_code == 200:
            return json.dumps(response.json(), indent=2, default=str)
        else:
            return json.dumps({"error": f"API returned {response.status_code}"})


@mcp.tool()
async def create_vonk(
    title: str,
    category: str,
    location_name: str,
    latitude: float,
    longitude: float,
    scheduled_at: str,
    description: str = "",
    max_participants: int = 6,
    user_id: str = None,
    phone: str = None,
) -> str:
    """
    Create a new vonk (micro-gathering). Anyone can light a new spark.

    Args:
        title: Name of the vonk (e.g., "Coffee & Conversations")
        category: One of "social", "active", "creative", "learning", "quiet", "food"
        location_name: Where it happens (e.g., "Café De Ooievaar, Witte de Withstraat")
        latitude: Venue latitude
        longitude: Venue longitude
        scheduled_at: When it happens in ISO format (e.g., "2026-05-19T19:00:00")
        description: Optional longer description
        max_participants: Maximum people (default 6)
        user_id: Creator's user ID
        phone: Creator's phone (if from WhatsApp/voice)
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {}
        if user_id:
            headers["X-User-ID"] = user_id

        payload = {
            "title": title,
            "category": category,
            "location_name": location_name,
            "latitude": latitude,
            "longitude": longitude,
            "scheduled_at": scheduled_at,
            "description": description,
            "max_participants": max_participants,
        }
        if phone:
            payload["phone"] = phone

        response = await client.post(
            f"{VONK_API}/api/vonk",
            json=payload,
            headers=headers,
        )
        if response.status_code in (200, 201):
            return json.dumps({"success": True, "vonk": response.json()}, default=str)
        else:
            return json.dumps({"success": False, "error": response.text})


@mcp.tool()
async def get_municipality_dashboard(city: str = "Rotterdam") -> str:
    """
    Get aggregate connection metrics for a municipality. Returns vonk counts,
    participation rates, and connection density — NO individual user data.

    Args:
        city: City name (default: Rotterdam)
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(
            f"{VONK_API}/api/dashboard/metrics",
            params={"city": city},
        )
        if response.status_code == 200:
            return json.dumps(response.json(), indent=2, default=str)
        else:
            return json.dumps({"error": f"API returned {response.status_code}"})


@mcp.tool()
async def get_or_create_user(phone: str, name: str = None) -> str:
    """
    Look up a user by phone number. Returns their profile and preferences if
    they exist, or creates a new user if they're calling for the first time.

    USE THIS AT THE START OF EVERY PHONE/WHATSAPP CONVERSATION so the agent
    always has a user_id and (for returning callers) the full preferences blob.

    Response includes:
      - id, name, last_name, phone, city, neighborhood
      - preferences (null for first-timers; dict for returning users)
      - has_preferences: bool — branch on this to decide onboarding vs. quick-match
      - is_new: bool — true if the row was just created

    Args:
        phone: E.164 phone number, e.g. "+31612345678".
        name: Optional name for first-time callers (used only if creating).
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        payload = {"phone": phone, "channel": "voice"}
        if name:
            payload["name"] = name
        # Probe first so we can flag is_new without a second round-trip.
        probe = await client.get(f"{VONK_API}/api/auth/by-phone/{phone}")
        existed = probe.status_code == 200
        response = await client.post(f"{VONK_API}/api/auth/phone-lookup", json=payload)
        if response.status_code == 200:
            data = response.json()
            data["is_new"] = not existed
            return json.dumps(data, indent=2, default=str)
        return json.dumps(
            {"error": f"phone-lookup returned {response.status_code}", "detail": response.text}
        )


@mcp.tool()
async def update_user_preferences(
    phone: str,
    categories: list[str] = None,
    group_size: str = None,
    time_preference: str = None,
    languages: list[str] = None,
) -> str:
    """
    Save a user's preferences after the onboarding conversation. Call this
    after learning what they like so we remember them next time they call.

    Partial updates are fine — pass only the fields you've learned. Existing
    fields are preserved.

    Args:
        phone: E.164 phone number to identify the user.
        categories: List of interests, any of: "social", "active", "creative",
                    "learning", "quiet", "food".
        group_size: One of "one_on_one", "small_groups", "any_size".
        time_preference: One of "weekday_evenings", "weekends", "spontaneous".
        languages: Languages the user speaks. First one wins for the agent's
                   response language; extras are noted on the profile.
    """
    body: dict = {"phone": phone}
    if categories is not None:
        body["categories"] = categories
    if group_size is not None:
        body["group_size"] = group_size
    if time_preference is not None:
        body["time_preference"] = time_preference
    if languages is not None:
        body["languages"] = languages
    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.patch(f"{VONK_API}/api/auth/preferences", json=body)
        if response.status_code == 200:
            data = response.json()
            return json.dumps(
                {
                    "success": True,
                    "name": data.get("name"),
                    "preferences": data.get("preferences"),
                    "has_preferences": data.get("has_preferences"),
                },
                indent=2,
                default=str,
            )
        return json.dumps(
            {"success": False, "error": response.text, "status": response.status_code}
        )


@mcp.tool()
async def get_user_profile(phone: str = None, user_id: str = None) -> str:
    """
    Get a user's full profile: name, preferences, vonken attended, vuuren
    membership. Use this to personalise the conversation for returning users
    once you already have an id (e.g. after get_or_create_user).

    Pass either `phone` OR `user_id`. Returns the user record and the same
    /me/stats payload the citizen UI uses for the profile page.

    Args:
        phone: E.164 phone number.
        user_id: UUID of the user.
    """
    if not phone and not user_id:
        return json.dumps({"error": "Pass either phone or user_id"})

    async with httpx.AsyncClient(timeout=15.0) as client:
        if user_id:
            # Cheap GET — there isn't a /users/{id} endpoint but the guest
            # endpoint resolves an id to UserOut idempotently.
            user_resp = await client.post(
                f"{VONK_API}/api/auth/guest", json={"user_id": user_id}
            )
        else:
            user_resp = await client.get(f"{VONK_API}/api/auth/by-phone/{phone}")
        if user_resp.status_code != 200:
            return json.dumps(
                {"error": "user not found", "status": user_resp.status_code}
            )
        user = user_resp.json()

        # Stats endpoint is X-User-Id gated; pass the resolved id.
        stats_resp = await client.get(
            f"{VONK_API}/api/auth/me/stats",
            headers={"X-User-Id": user["id"]},
        )
        stats = stats_resp.json() if stats_resp.status_code == 200 else None

        return json.dumps(
            {
                "id": user["id"],
                "name": user.get("name"),
                "last_name": user.get("last_name"),
                "phone": user.get("phone"),
                "city": user.get("city"),
                "neighborhood": user.get("neighborhood"),
                "preferences": user.get("preferences"),
                "has_preferences": user.get("has_preferences"),
                "registered_by_name": user.get("registered_by_name"),
                "registered_by_org": user.get("registered_by_org"),
                "stats": stats,
            },
            indent=2,
            default=str,
        )


if __name__ == "__main__":
    # Host/port come from FASTMCP_HOST / FASTMCP_PORT env vars (set in
    # docker-compose). Newer MCP connectors (Anthropic's web Connectors UI
    # included) handshake on Streamable HTTP at /mcp, not the older /sse.
    mcp.run(transport="streamable-http")
