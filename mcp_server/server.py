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
from mcp.server.fastmcp import FastMCP

mcp = FastMCP(
    "Vonk",
    description=(
        "Vonk — social connection platform for Dutch municipalities. "
        "Find and join micro-gatherings (vonken), discover what people "
        "nearby are looking for, and help people find their fire."
    ),
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
async def join_vonk(vonk_id: str, user_id: str = None, phone: str = None) -> str:
    """
    Join a vonk (micro-gathering). The person is added to the participant list.

    Args:
        vonk_id: The ID of the vonk to join
        user_id: The user's ID (if known from web)
        phone: The user's phone number (if from WhatsApp/voice — will find or create user)
    """
    async with httpx.AsyncClient(timeout=15.0) as client:
        headers = {}
        if user_id:
            headers["X-User-ID"] = user_id

        payload = {}
        if phone:
            payload["phone"] = phone

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
            headers["X-User-ID"] = user_id

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


if __name__ == "__main__":
    mcp.run(transport="sse")
