"""Idempotent demo seed for Vonk.

Run inside the backend container:
    docker-compose exec backend python -m scripts.seed

Produces:
- ~30 users across Rotterdam / Den Haag / Amsterdam, diverse age groups,
  including 4 elderly registered via wijkconnector channel.
- 12 active gloeds spanning all categories and energy levels.
- 5 upcoming vonken (next 24-72h) with 2-4 joined participants each.
- 1 completed vuur with 4 members and a follow-up vonk scheduled.
- 7 days of aggregate connection metrics per city.
- 4 demo AI conversations (student, recent immigrant, elderly via wijkconnector,
  remote worker) with realistic message histories.

The seed truncates the relevant tables before inserting so it's safe to
re-run between demo takes.
"""

from __future__ import annotations

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import SessionLocal
from app.models import (
    AIConversation,
    ConnectionMetric,
    Gloed,
    User,
    Vonk,
    VonkParticipant,
    Vuur,
    VuurMember,
)


CITIES = {
    "Rotterdam": {
        "center": (51.9225, 4.4792),
        "neighborhoods": ["Kralingen", "Noord", "Centrum", "Delfshaven", "Hillegersberg"],
    },
    "Den Haag": {
        "center": (52.0705, 4.3007),
        "neighborhoods": ["Centrum", "Scheveningen", "Bezuidenhout", "Statenkwartier"],
    },
    "Amsterdam": {
        "center": (52.3676, 4.9041),
        "neighborhoods": ["Oost", "Jordaan", "De Pijp", "Noord", "Westerpark"],
    },
}

FIRST_NAMES = [
    "Sanne", "Jeroen", "Lotte", "Bram", "Anouk", "Thijs", "Iris", "Daan",
    "Femke", "Sven", "Noor", "Ruben", "Eva", "Joost", "Linde", "Maarten",
    "Pien", "Mees", "Sara", "Lars", "Yara", "Tim", "Roos", "Pieter",
    "Hannah", "Niels", "Esmée", "Bas", "Marieke", "Jan",
]
LAST_NAMES = [
    "de Vries", "Jansen", "van der Berg", "Bakker", "Visser", "Smit",
    "Meijer", "Mulder", "de Boer", "de Groot", "Bos", "Vos", "Peters",
    "Hendriks", "van Dijk",
]

AGE_GROUPS_WEIGHTED = (
    [("18-25", 4), ("26-35", 8), ("36-50", 8), ("51-65", 5), ("65+", 5)]
)


def _jitter_point(center: tuple[float, float], spread_km: float = 3.0) -> tuple[float, float]:
    lat_jit = random.uniform(-spread_km, spread_km) / 111.0
    lon_jit = random.uniform(-spread_km, spread_km) / 111.0
    return (center[0] + lat_jit, center[1] + lon_jit)


def _weighted_choice(items: list[tuple[str, int]]) -> str:
    pool = [v for v, w in items for _ in range(w)]
    return random.choice(pool)


GLOED_TEMPLATES = [
    {
        "raw": "I just want to be around people tonight without much pressure.",
        "ai": "Looking for low-key company tonight — somewhere to be near others.",
        "category": "social", "energy": "low", "group": "small", "time": "now",
    },
    {
        "raw": "Anyone want to go for a long walk in the park?",
        "ai": "Long walk in the park — fresh air and a slow chat.",
        "category": "active", "energy": "medium", "group": "small", "time": "today",
    },
    {
        "raw": "I'd love to find someone to sketch with at a café.",
        "ai": "Sketching at a café — quiet creative time with one other.",
        "category": "creative", "energy": "low", "group": "one_on_one", "time": "this_week",
    },
    {
        "raw": "Looking for a chess partner this weekend.",
        "ai": "Chess this weekend — focused, one-on-one.",
        "category": "learning", "energy": "low", "group": "one_on_one", "time": "this_week",
    },
    {
        "raw": "Want to cook a simple dinner together with someone?",
        "ai": "Cook a simple dinner together — warm and grounding.",
        "category": "food", "energy": "medium", "group": "one_on_one", "time": "today",
    },
    {
        "raw": "Trail running buddy needed!",
        "ai": "Trail running buddy — high energy, outdoors.",
        "category": "active", "energy": "high", "group": "one_on_one", "time": "this_week",
    },
    {
        "raw": "I miss singing with people. Anyone for a singalong?",
        "ai": "Group singalong — joyful, anyone welcome.",
        "category": "creative", "energy": "medium", "group": "any", "time": "this_week",
    },
    {
        "raw": "Just moved here from Bogotá. Would love to meet a local for coffee.",
        "ai": "New in the city — coffee with a local for orientation and warmth.",
        "category": "social", "energy": "low", "group": "one_on_one", "time": "this_week",
    },
    {
        "raw": "I want a quiet reading evening with one or two others.",
        "ai": "Quiet reading evening — silent companionship, two or three people.",
        "category": "quiet", "energy": "low", "group": "small", "time": "today",
    },
    {
        "raw": "Anyone want to learn basic Dutch with me over a beer?",
        "ai": "Dutch practice over a beer — playful learning with company.",
        "category": "learning", "energy": "medium", "group": "small", "time": "this_week",
    },
    {
        "raw": "Looking for a board game group tonight.",
        "ai": "Board games tonight — energetic small group.",
        "category": "social", "energy": "medium", "group": "small", "time": "now",
    },
    {
        "raw": "Anyone want to try the new ramen place together?",
        "ai": "New ramen place — food and easy conversation.",
        "category": "food", "energy": "medium", "group": "any", "time": "today",
    },
]


VONK_TEMPLATES = [
    {
        "title": "Sketching evening at Hopper",
        "description": "A quiet sketching session at Café Hopper. Bring your own notebook. We share a table, we share a coffee.",
        "category": "creative",
        "location_name": "Café Hopper",
        "max": 4,
        "hours_ahead": 5,
    },
    {
        "title": "Park walk + bring-your-own-tea",
        "description": "Slow walk around Kralingse Plas, thermos of tea encouraged. Easy pace, easy chat.",
        "category": "active",
        "location_name": "Kralingse Plas",
        "max": 6,
        "hours_ahead": 18,
    },
    {
        "title": "Quiet reading at the library",
        "description": "A silent shared hour in the reading room. We say hi at the door and bye at the end.",
        "category": "quiet",
        "location_name": "Centrale Bibliotheek",
        "max": 4,
        "hours_ahead": 27,
    },
    {
        "title": "Stamppot night at Anna's",
        "description": "Cooking stamppot together at Anna's apartment. Beginners very welcome. Bring nothing, leave fed.",
        "category": "food",
        "location_name": "Noord — host's apartment",
        "max": 5,
        "hours_ahead": 30,
    },
    {
        "title": "Beginners' Dutch over a beer",
        "description": "Forty-five minutes of basic Dutch in a low-pressure pub. Native speakers help out.",
        "category": "learning",
        "location_name": "Café De Witte Aap",
        "max": 6,
        "hours_ahead": 48,
    },
]


DEMO_CONVERSATIONS = [
    {
        "persona": "student",
        "city": "Rotterdam",
        "messages": [
            {"role": "user", "content": "It's my third week here and I haven't really talked to anyone outside class."},
            {"role": "assistant", "content": "That makes sense — first weeks anywhere are weirdly silent. What sort of evening would feel good — something out of the house, or something where you can just listen for a while?"},
            {"role": "user", "content": "Honestly something low-key. I don't want a big group."},
            {"role": "assistant", "content": "Got it. Coffee or a walk would probably feel right — let me see what's around you tonight."},
        ],
    },
    {
        "persona": "recent_immigrant",
        "city": "Amsterdam",
        "messages": [
            {"role": "user", "content": "Just moved from Bogotá last month. I'd love to meet someone local who could show me around."},
            {"role": "assistant", "content": "Welcome! Is it more 'show me the neighbourhood and a good café' or 'I want a friend who happens to be from here'?"},
            {"role": "user", "content": "Honestly both, but starting small."},
            {"role": "assistant", "content": "Perfect — coffee with one local. Let me find a good match."},
        ],
    },
    {
        "persona": "elderly_wijkconnector",
        "city": "Den Haag",
        "messages": [
            {"role": "user", "content": "Marja from the wijkcentrum is helping me. I'd like to play cards once a week with people my age."},
            {"role": "assistant", "content": "That's lovely — afternoon or evening? And is there a café or buurthuis near you you already like?"},
            {"role": "user", "content": "Afternoon. There's a buurthuis on Bezuidenhoutseweg."},
            {"role": "assistant", "content": "Got it. I'll see who else nearby is looking for the same."},
        ],
    },
    {
        "persona": "remote_worker",
        "city": "Rotterdam",
        "messages": [
            {"role": "user", "content": "I work from home and I've barely left the apartment this week."},
            {"role": "assistant", "content": "Common one. Are you in the mood to be around people quietly — like a café where you can also work — or do you want a break that's actually a break?"},
            {"role": "user", "content": "A real break. Something that gets me moving."},
            {"role": "assistant", "content": "Then a walk somewhere green sounds right. Let me check what's near you."},
        ],
    },
]


async def truncate_all(db: AsyncSession) -> None:
    # Order matters because of FKs; use CASCADE for safety.
    await db.execute(text("""
        TRUNCATE TABLE
            ai_conversations,
            vonk_participants,
            vuur_members,
            connection_metrics,
            vonken,
            vuuren,
            gloeds,
            users
        RESTART IDENTITY CASCADE
    """))


def make_user(*, city: str, neighborhood: str, channel: str = "web") -> User:
    name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
    lat, lon = _jitter_point(CITIES[city]["center"], 4.0)
    age = "65+" if channel == "wijkconnector" else _weighted_choice(AGE_GROUPS_WEIGHTED)
    return User(
        name=name,
        channel=channel,
        city=city,
        neighborhood=neighborhood,
        latitude=lat,
        longitude=lon,
        age_group=age,
        phone=f"+316{random.randint(10000000, 99999999)}" if channel != "web" else None,
        client_id=f"seed-{uuid.uuid4().hex[:12]}" if channel == "web" else None,
    )


def make_gloed(user: User, template: dict) -> Gloed:
    lat, lon = _jitter_point((user.latitude or 0, user.longitude or 0), 0.5)
    created = datetime.now(timezone.utc) - timedelta(minutes=random.randint(5, 120))
    expires_in = {"now": 3, "today": 12, "this_week": 96}[template["time"]]
    return Gloed(
        user_id=user.id,
        raw_input=template["raw"],
        ai_parsed=template["ai"],
        category=template["category"],
        energy_level=template["energy"],
        group_size_pref=template["group"],
        time_preference=template["time"],
        latitude=lat,
        longitude=lon,
        radius_km=5.0,
        active=True,
        created_at=created,
        expires_at=created + timedelta(hours=expires_in),
    )


def make_vonk(creator: User, template: dict) -> Vonk:
    city_info = CITIES[creator.city or "Rotterdam"]
    lat, lon = _jitter_point(city_info["center"], 2.5)
    scheduled = datetime.now(timezone.utc) + timedelta(hours=template["hours_ahead"])
    return Vonk(
        creator_id=creator.id,
        title=template["title"],
        description=template["description"],
        category=template["category"],
        location_name=template["location_name"],
        latitude=lat,
        longitude=lon,
        scheduled_at=scheduled,
        max_participants=template["max"],
        status="open",
        ai_suggested=False,
    )


async def seed() -> None:
    random.seed(42)

    async with SessionLocal() as db:
        await truncate_all(db)
        await db.commit()

    async with SessionLocal() as db:
        users: list[User] = []

        # 26 web users
        for _ in range(26):
            city = random.choice(list(CITIES.keys()))
            neigh = random.choice(CITIES[city]["neighborhoods"])
            users.append(make_user(city=city, neighborhood=neigh, channel="web"))

        # 4 wijkconnector-registered elderly
        for _ in range(4):
            city = random.choice(list(CITIES.keys()))
            neigh = random.choice(CITIES[city]["neighborhoods"])
            users.append(make_user(city=city, neighborhood=neigh, channel="wijkconnector"))

        for u in users:
            db.add(u)
        await db.flush()

        # 12 active gloeds
        sample_users = random.sample(users, 12)
        gloeds = [make_gloed(u, t) for u, t in zip(sample_users, GLOED_TEMPLATES)]
        for g in gloeds:
            db.add(g)
        await db.flush()

        # 5 upcoming vonken with 2-4 participants each
        creators = random.sample([u for u in users if u.channel != "wijkconnector"], 5)
        vonken: list[Vonk] = []
        for creator, template in zip(creators, VONK_TEMPLATES):
            v = make_vonk(creator, template)
            db.add(v)
            vonken.append(v)
        await db.flush()

        for v in vonken:
            participants = [v.creator_id] + [
                u.id
                for u in random.sample(
                    [u for u in users if u.id != v.creator_id], random.randint(1, 3)
                )
            ]
            for uid in participants:
                db.add(
                    VonkParticipant(
                        vonk_id=v.id,
                        user_id=uid,
                        joined_at=datetime.now(timezone.utc) - timedelta(hours=random.randint(1, 10)),
                    )
                )

        # 1 completed vuur with 4 members + a follow-up vonk
        vuur = Vuur(name="Kralingen Walk & Talk", description="Tuesday evening park loops, easy pace.")
        db.add(vuur)
        await db.flush()
        rotterdam_users = [u for u in users if u.city == "Rotterdam"]
        if len(rotterdam_users) >= 4:
            for u in random.sample(rotterdam_users, 4):
                db.add(VuurMember(vuur_id=vuur.id, user_id=u.id))

        followup = Vonk(
            creator_id=random.choice(rotterdam_users).id if rotterdam_users else users[0].id,
            title="Kralingen Walk & Talk — Tuesday loop",
            description="The usual evening loop. Newcomers welcome.",
            category="active",
            location_name="Kralingse Plas",
            latitude=CITIES["Rotterdam"]["center"][0] + 0.01,
            longitude=CITIES["Rotterdam"]["center"][1] + 0.005,
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=1, hours=19),
            max_participants=8,
            status="open",
        )
        db.add(followup)

        # 7 days of metrics per city
        today = date.today()
        for city in CITIES:
            for d in range(7):
                day = today - timedelta(days=6 - d)
                trend_factor = 0.5 + (d / 6.0) * 0.8
                db.add(
                    ConnectionMetric(
                        city=city,
                        neighborhood=None,
                        date=day,
                        vonken_count=max(1, int(random.randint(3, 12) * trend_factor)),
                        unique_participants=max(1, int(random.randint(8, 32) * trend_factor)),
                        repeat_participants=max(0, int(random.randint(2, 10) * trend_factor)),
                        vuuren_formed=1 if random.random() < 0.3 else 0,
                        cross_age_vonken=max(0, int(random.randint(1, 6) * trend_factor)),
                        avg_time_to_first_vonk=timedelta(days=random.randint(2, 6)),
                    )
                )

        # 4 demo AI conversations
        for demo in DEMO_CONVERSATIONS:
            candidate = next(
                (u for u in users if u.city == demo["city"]), None
            )
            if candidate is None:
                continue
            db.add(
                AIConversation(
                    user_id=candidate.id,
                    channel="web" if demo["persona"] != "elderly_wijkconnector" else "wijkconnector",
                    messages=demo["messages"],
                    resulting_gloed_id=None,
                )
            )

        await db.commit()

        print(
            f"Seeded {len(users)} users, {len(gloeds)} gloeds, "
            f"{len(vonken) + 1} vonken (incl. vuur follow-up), 1 vuur, "
            f"{7 * len(CITIES)} days of metrics, {len(DEMO_CONVERSATIONS)} demo conversations."
        )


if __name__ == "__main__":
    asyncio.run(seed())
