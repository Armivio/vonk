"""Idempotent demo seed for Vonk.

Run inside the backend container:
    docker-compose exec backend python -m scripts.seed

Produces:
- ~30 users across Rotterdam / Den Haag / Amsterdam, diverse age groups,
  including 4 elderly registered via wijkconnector channel and 5 named
  demo personas (Sophie, Henk, Priya, Daan, Yuki) who anchor the pitch.
- 12 active gloeds spanning all categories and energy levels.
- A range of vonken at different stages: 5 today, 5 tomorrow, 3 this week,
  3 completed, plus 3 wijkconnector-organised ones and a vuur follow-up.
- 2 vuuren formed from completed vonken, showing the progression.
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


# 18 curated Rotterdam vonken with real coordinates + 3 wijkconnector ones below.
# coords are (lat, lon) — looked up from real Rotterdam venues.
VONK_TEMPLATES = [
    {"title": "Coffee & Conversations", "description": "Open table at Café De Ooievaar. Pull up a chair, talk about anything but the weather.", "category": "social", "location_name": "Café De Ooievaar, Witte de Withstraat", "lat": 51.9159, "lon": 4.4805, "max": 6, "hours_ahead": 3},
    {"title": "Sunset Walk at Kralingse Plas", "description": "Easy loop around the lake at golden hour. Slow pace, thermos of tea encouraged.", "category": "active", "location_name": "Kralingse Plas", "lat": 51.9298, "lon": 4.5099, "max": 8, "hours_ahead": 6},
    {"title": "Sketch & Sip", "description": "Bring your sketchbook. We share a table at the Fenix Food Factory. No skill required, just curiosity.", "category": "creative", "location_name": "Fenix Food Factory, Katendrecht", "lat": 51.8983, "lon": 4.4795, "max": 5, "hours_ahead": 26},
    {"title": "Study Sprint", "description": "Two-hour focused work block at the central library. We sit at the same table, no talking, accountability by proximity.", "category": "learning", "location_name": "Centrale Bibliotheek Rotterdam", "lat": 51.9219, "lon": 4.4844, "max": 4, "hours_ahead": 18},
    {"title": "Board Game Evening", "description": "Catan, Codenames, whatever's on the shelf at Aloha. Light snacks, low pressure.", "category": "social", "location_name": "Aloha Bar, Katendrecht", "lat": 51.8986, "lon": 4.4861, "max": 6, "hours_ahead": 30},
    {"title": "Cook Indonesian Together", "description": "Nasi goreng and lumpia from scratch at Lina's place in Delfshaven. Bring an appetite, leave full.", "category": "food", "location_name": "Delfshaven — host's apartment", "lat": 51.9089, "lon": 4.4582, "max": 5, "hours_ahead": 28},
    {"title": "Morning Yoga in the Park", "description": "Outdoor flow under the Euromast. All levels — modifications offered. Bring a mat or a towel.", "category": "active", "location_name": "Het Park, Euromast", "lat": 51.9054, "lon": 4.4663, "max": 8, "hours_ahead": 16},
    {"title": "Language Exchange: Dutch / English", "description": "Half hour in Dutch, half in English. Forgiving, fun, useful.", "category": "learning", "location_name": "Kopi Soesoe, Witte de Withstraat", "lat": 51.9251, "lon": 4.4824, "max": 6, "hours_ahead": 44},
    {"title": "Photography Walk: Markthal → Cube Houses", "description": "Slow walk with cameras, phones, anything. We trade tips and stop a lot.", "category": "creative", "location_name": "Markthal → Cube Houses", "lat": 51.9202, "lon": 4.4862, "max": 6, "hours_ahead": 36},
    {"title": "Silent Reading Hour", "description": "An hour of shared silent reading. Bring a book. The only sound is pages turning.", "category": "quiet", "location_name": "Book Exchange, Witte de Withstraat", "lat": 51.9159, "lon": 4.4805, "max": 5, "hours_ahead": 22},
    {"title": "Fishing at the Maas", "description": "Quiet morning by the river. Bring a rod or borrow one — patience guaranteed, fish less so.", "category": "quiet", "location_name": "Erasmusbrug waterfront", "lat": 51.9087, "lon": 4.4863, "max": 4, "hours_ahead": 14},
    {"title": "Salsa Beginners", "description": "Forty minutes of basic steps with a patient instructor. Singles welcome, partners rotate.", "category": "active", "location_name": "Annabel, Coolhaven", "lat": 51.9116, "lon": 4.4593, "max": 10, "hours_ahead": 38},
    {"title": "Potluck Dinner", "description": "Bring one dish to share, leave with a belly full and three new acquaintances.", "category": "food", "location_name": "Delfshaven Community Centre", "lat": 51.9089, "lon": 4.4582, "max": 8, "hours_ahead": 50},
    {"title": "Tech Meetup: AI Tools", "description": "Casual show-and-tell of AI tools people are actually using. Bring a laptop or just curiosity.", "category": "learning", "location_name": "42workspace Rotterdam", "lat": 51.9244, "lon": 4.4777, "max": 12, "hours_ahead": 54},
    {"title": "Karaoke Night", "description": "Sing badly with friends and strangers. Drinks not required. Courage encouraged.", "category": "social", "location_name": "Paddy Murphy's, Rodezand", "lat": 51.9242, "lon": 4.4842, "max": 8, "hours_ahead": 52},
    {"title": "Cube Houses Coffee Crawl", "description": "Three small cafés near the Cube Houses. We move slow, we talk slower.", "category": "social", "location_name": "Cube Houses area", "lat": 51.9202, "lon": 4.4900, "max": 5, "hours_ahead": 10},
    {"title": "Cinema Friday: Whatever's Playing", "description": "Pick a film together at LantarenVenster, drink after.", "category": "social", "location_name": "LantarenVenster, Kop van Zuid", "lat": 51.9036, "lon": 4.4878, "max": 6, "hours_ahead": 48},
    {"title": "Open Mic Acoustic", "description": "Sign up or just listen. Warm room, warmer audience.", "category": "creative", "location_name": "Bird, Raampoortstraat", "lat": 51.9279, "lon": 4.4756, "max": 10, "hours_ahead": 56},
]


# Wijkconnector-organised vonken (created on behalf of older neighbours)
WIJKCONNECTOR_VONK_TEMPLATES = [
    {"title": "Kaarten en Koffie", "description": "Klaverjas en koffie op woensdagmiddag. Iedereen welkom, ook beginners.", "category": "social", "location_name": "Buurthuis Charlois", "lat": 51.8869, "lon": 4.4625, "max": 6, "hours_ahead": 20},
    {"title": "Wandelen in Zuiderpark", "description": "Rustige wandeling van een uur. Tempo aanpasbaar. Verzamelen bij de hoofdingang.", "category": "active", "location_name": "Zuiderpark hoofdingang", "lat": 51.8769, "lon": 4.4956, "max": 8, "hours_ahead": 40},
    {"title": "Breien & Babbelen", "description": "Brei mee of luister gewoon. Wol en pennen aanwezig voor wie wil leren.", "category": "creative", "location_name": "Bibliotheek Feijenoord", "lat": 51.9094, "lon": 4.5151, "max": 8, "hours_ahead": 60},
]


# Named demo personas — these anchor the pitch.
# Each one shows a different range of who Vonk reaches.
DEMO_PERSONAS = [
    {
        "name": "Sophie",
        "last_name": "Maartens",
        "channel": "web",
        "city": "Rotterdam",
        "neighborhood": "Centrum",
        "age_group": "26-35",
        "lat": 51.9180,
        "lon": 4.4830,
        "story": "Moved to Rotterdam 3 weeks ago, started a vuur.",
        "preferences": {
            "interests": ["social", "quiet", "creative"],
            "social_style": "small_groups",
            "energy_baseline": "balanced",
            "typical_when": "weekday_evenings",
            "comfort_radius_km": 5,
            "language": "en",
            "notes": "New to the city, looking for warm gentle introductions.",
        },
    },
    {
        "name": "Henk",
        "last_name": "de Vries",
        "channel": "wijkconnector",
        "city": "Rotterdam",
        "neighborhood": "Charlois",
        "age_group": "65+",
        "lat": 51.8869,
        "lon": 4.4625,
        "phone": "+31610000001",
        "story": "Hosts Kaarten en Koffie weekly at Buurthuis Charlois.",
        "preferences": {
            "interests": ["social", "quiet"],
            "social_style": "small_groups",
            "energy_baseline": "low",
            "typical_when": "weekday_evenings",
            "comfort_radius_km": 2,
            "language": "nl",
            "notes": "Klaverjas, koffie en een goed gesprek. Liever dichtbij huis.",
        },
    },
    {
        "name": "Priya",
        "last_name": "Shankar",
        "channel": "web",
        "city": "Rotterdam",
        "neighborhood": "Kralingen",
        "age_group": "26-35",
        "lat": 51.9265,
        "lon": 4.5040,
        "story": "Remote worker, joined Coffee & Conversations, now a regular.",
        "preferences": {
            "interests": ["social", "quiet"],
            "social_style": "small_groups",
            "energy_baseline": "balanced",
            "typical_when": "weekday_evenings",
            "comfort_radius_km": 5,
            "language": "en",
            "notes": "Wants people, not noise.",
        },
    },
    {
        "name": "Daan",
        "last_name": "Klaassen",
        "channel": "web",
        "city": "Rotterdam",
        "neighborhood": "Centrum",
        "age_group": "18-25",
        "lat": 51.9217,
        "lon": 4.4870,
        "story": "TU Delft student, organises study sprints.",
        "preferences": {
            "interests": ["learning", "social"],
            "social_style": "small_groups",
            "energy_baseline": "high",
            "typical_when": "weekday_evenings",
            "comfort_radius_km": 5,
            "language": "nl",
            "notes": "Studie + gezelschap, klein groepje liefst.",
        },
    },
    {
        "name": "Yuki",
        "last_name": "Tanaka",
        "channel": "web",
        "city": "Rotterdam",
        "neighborhood": "Delfshaven",
        "age_group": "26-35",
        "lat": 51.9089,
        "lon": 4.4582,
        "story": "Japanese expat, joined language exchange.",
        "preferences": {
            "interests": ["learning", "creative"],
            "social_style": "any_size",
            "energy_baseline": "balanced",
            "typical_when": "weekends",
            "comfort_radius_km": 12,
            "language": "en",
            "notes": "Learning Dutch, loves photo walks.",
        },
    },
    {
        "name": "Fatima",
        "last_name": "Bouhlal",
        "channel": "web",
        "city": "Rotterdam",
        "neighborhood": "Feijenoord",
        "age_group": "36-50",
        "lat": 51.9094,
        "lon": 4.5151,
        "story": "Mother of two, started a potluck vuur.",
        "preferences": {
            "interests": ["food", "social"],
            "social_style": "any_size",
            "energy_baseline": "balanced",
            "typical_when": "weekends",
            "comfort_radius_km": 5,
            "language": "nl",
            "notes": "Liefst etentjes met gezinnen uit de buurt.",
        },
    },
    {
        "name": "Marco",
        "last_name": "Riccardi",
        "channel": "wijkconnector",
        "city": "Rotterdam",
        "neighborhood": "Kralingen",
        "age_group": "65+",
        "lat": 51.9298,
        "lon": 4.5099,
        "phone": "+31610000002",
        "story": "Retired, organises twice-weekly walking group at Kralingse Plas.",
        "preferences": {
            "interests": ["active", "quiet"],
            "social_style": "small_groups",
            "energy_baseline": "balanced",
            "typical_when": "weekday_evenings",
            "comfort_radius_km": 5,
            "language": "nl",
            "notes": "Rustig wandeltempo, vaste route.",
        },
    },
    {
        "name": "Lisa",
        "last_name": "Wisse",
        "channel": "web",
        "city": "Rotterdam",
        "neighborhood": "Centrum",
        "age_group": "26-35",
        "lat": 51.9210,
        "lon": 4.4815,
        "story": "Freelancer, board game enthusiast, attends quiet coffee vonken.",
        "preferences": {
            "interests": ["social", "quiet", "creative"],
            "social_style": "small_groups",
            "energy_baseline": "low",
            "typical_when": "weekends",
            "comfort_radius_km": 5,
            "language": "en",
            "notes": "Loves Catan and slow coffees.",
        },
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
    # Templates carry real lat/lon for the venue. Fall back to a city-centre jitter only if missing.
    lat = template.get("lat")
    lon = template.get("lon")
    if lat is None or lon is None:
        city_info = CITIES[creator.city or "Rotterdam"]
        lat, lon = _jitter_point(city_info["center"], 2.5)
    scheduled = _snap_to_realistic_hour(
        datetime.now(timezone.utc) + timedelta(hours=template["hours_ahead"])
    )
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


def _snap_to_realistic_hour(dt: datetime) -> datetime:
    """Snap to a plausible gathering hour: weekdays 17-21, weekends 10-21."""
    weekday = dt.weekday()  # 0 Mon .. 6 Sun
    if weekday < 5:
        hour = random.choice([17, 18, 19, 19, 20, 21])
    else:
        hour = random.choice([10, 11, 14, 15, 16, 17, 18, 19, 20, 21])
    minute = random.choice([0, 0, 15, 30, 30, 45])
    return dt.replace(hour=hour, minute=minute, second=0, microsecond=0)


async def seed() -> None:
    random.seed(42)

    async with SessionLocal() as db:
        await truncate_all(db)
        await db.commit()

    async with SessionLocal() as db:
        users: list[User] = []

        # Named demo personas first — they anchor the story.
        personas_by_name: dict[str, User] = {}
        for p in DEMO_PERSONAS:
            u = User(
                name=p["name"],
                last_name=p.get("last_name"),
                channel=p["channel"],
                city=p["city"],
                neighborhood=p["neighborhood"],
                latitude=p["lat"],
                longitude=p["lon"],
                age_group=p["age_group"],
                phone=p.get("phone"),
                preferences=p.get("preferences"),
                client_id=f"seed-persona-{p['name'].lower()}" if p["channel"] == "web" else None,
            )
            users.append(u)
            personas_by_name[p["name"]] = u

        # 22 anonymous web users (mostly Rotterdam for the demo)
        for _ in range(22):
            city = random.choices(list(CITIES.keys()), weights=[5, 2, 2])[0]
            neigh = random.choice(CITIES[city]["neighborhoods"])
            users.append(make_user(city=city, neighborhood=neigh, channel="web"))

        # 3 more wijkconnector-registered elderly (Henk is already one)
        for _ in range(3):
            city = random.choice(list(CITIES.keys()))
            neigh = random.choice(CITIES[city]["neighborhoods"])
            users.append(make_user(city=city, neighborhood=neigh, channel="wijkconnector"))

        for u in users:
            db.add(u)
        await db.flush()

        sophie = personas_by_name["Sophie"]
        henk = personas_by_name["Henk"]
        priya = personas_by_name["Priya"]
        daan = personas_by_name["Daan"]
        yuki = personas_by_name["Yuki"]
        _fatima = personas_by_name.get("Fatima")
        _marco = personas_by_name.get("Marco")
        _lisa = personas_by_name.get("Lisa")

        # 12 active gloeds (include Sophie & Yuki to make their stories visible)
        non_persona = [u for u in users if u.id not in {p.id for p in personas_by_name.values()}]
        gloed_users = [sophie, yuki] + random.sample(non_persona, 10)
        gloeds = [make_gloed(u, t) for u, t in zip(gloed_users, GLOED_TEMPLATES)]
        for g in gloeds:
            db.add(g)
        await db.flush()

        # ── Curated vonken at different stages ──────────────────────────────
        # Spec asks for: 5 today, 5 tomorrow, 3 this week, 3 completed, plus
        # wijkconnector ones and a vuur follow-up.

        web_users = [u for u in users if u.channel != "wijkconnector"]
        vonken: list[Vonk] = []

        # First 5 templates → today (in the next ~6h)
        # Next 5 templates → tomorrow
        # Remaining → spread across this week
        today_indices = [0, 1, 2, 14, 15]
        tomorrow_indices = [3, 4, 5, 6, 7]
        this_week_indices = [8, 9, 10]
        completed_indices = [11, 12, 13]

        # Specific creators for the demo personas' vonken
        creator_for_index: dict[int, User] = {
            0: priya,  # Coffee & Conversations — Priya is now a regular
            3: daan,   # Study Sprint — Daan
            7: yuki,   # Language Exchange — Yuki
        }

        for i, template in enumerate(VONK_TEMPLATES):
            creator = creator_for_index.get(i) or random.choice(web_users)
            t = dict(template)
            if i in today_indices:
                t["hours_ahead"] = random.choice([2, 3, 4, 5, 6])
            elif i in tomorrow_indices:
                t["hours_ahead"] = random.choice([22, 24, 27, 30, 32])
            elif i in this_week_indices:
                t["hours_ahead"] = random.choice([48, 56, 72, 96])
            elif i in completed_indices:
                # Schedule in the past — completed
                t["hours_ahead"] = -random.choice([24, 48, 72])
            v = make_vonk(creator, t)
            if i in completed_indices:
                v.status = "completed"
            db.add(v)
            vonken.append(v)

        # 3 wijkconnector-organised vonken — Henk hosts Kaarten en Koffie
        wijkconnector_users = [u for u in users if u.channel == "wijkconnector"]
        wijk_creator_for_index = {0: henk}  # Henk hosts the first one
        for i, template in enumerate(WIJKCONNECTOR_VONK_TEMPLATES):
            creator = wijk_creator_for_index.get(i) or random.choice(wijkconnector_users)
            v = make_vonk(creator, template)
            db.add(v)
            vonken.append(v)

        await db.flush()

        # Participants: each vonk gets the creator + 1..(max-1) others.
        # Ensure Sophie joins 2 vonken & Priya joins Coffee & Conversations.
        def add_participant(v: Vonk, uid: uuid.UUID, hours_ago: int = 4) -> None:
            db.add(
                VonkParticipant(
                    vonk_id=v.id,
                    user_id=uid,
                    joined_at=datetime.now(timezone.utc) - timedelta(hours=hours_ago),
                )
            )

        sophie_joins = random.sample(vonken[:10], 2)
        for v in vonken:
            existing_ids: set[uuid.UUID] = set()

            # Always the creator
            add_participant(v, v.creator_id)
            existing_ids.add(v.creator_id)

            # Persona-specific joins
            forced_extra: list[uuid.UUID] = []
            if v in sophie_joins and sophie.id != v.creator_id:
                forced_extra.append(sophie.id)
            if v.title == "Language Exchange: Dutch / English" and yuki.id != v.creator_id:
                forced_extra.append(yuki.id)
            if v.title == "Kaarten en Koffie" and len(forced_extra) < 2:
                # Bring 2 other 65+ neighbours
                seniors = [u for u in users if u.age_group == "65+" and u.id != v.creator_id][:2]
                forced_extra.extend([s.id for s in seniors])
            for uid in forced_extra:
                if uid not in existing_ids:
                    add_participant(v, uid, hours_ago=random.randint(2, 12))
                    existing_ids.add(uid)

            # Fill with random others
            others = [u for u in users if u.id not in existing_ids]
            remaining_slots = max(0, v.max_participants - len(existing_ids))
            extra_count = min(random.randint(1, 3), remaining_slots)
            if extra_count > 0 and others:
                for u in random.sample(others, min(extra_count, len(others))):
                    add_participant(v, u.id, hours_ago=random.randint(1, 10))

        # ── Two vuuren: one from the completed Walk & Talk, one new from
        #    Sophie's experience showing the persona's story.
        rotterdam_users = [u for u in users if u.city == "Rotterdam"]

        vuur1 = Vuur(
            name="Kralingen Walk & Talk",
            description="Tuesday evening park loops, easy pace. Formed after 3 completed vonken.",
        )
        db.add(vuur1)

        vuur2 = Vuur(
            name="Sophie's Sunday Coffee Crew",
            description="A small recurring coffee group started by Sophie in her first weeks in Rotterdam.",
        )
        db.add(vuur2)
        await db.flush()

        # Members of vuur1 — completed Walk & Talk regulars
        if len(rotterdam_users) >= 4:
            for u in random.sample(rotterdam_users, 4):
                db.add(VuurMember(vuur_id=vuur1.id, user_id=u.id))

        # Members of vuur2 — Sophie + 2-3 others she met in vonken
        sophie_vuur_mates: list[User] = [sophie]
        candidates = [u for u in rotterdam_users if u.id != sophie.id]
        for u in random.sample(candidates, min(3, len(candidates))):
            sophie_vuur_mates.append(u)
        for u in sophie_vuur_mates:
            db.add(VuurMember(vuur_id=vuur2.id, user_id=u.id))

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
        vonken.append(followup)
        await db.flush()
        add_participant(followup, followup.creator_id)

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

        # Demo AI conversations — anchor them on real personas where possible.
        persona_for_demo = {
            "student": daan,
            "recent_immigrant": yuki,
            "elderly_wijkconnector": henk,
            "remote_worker": priya,
        }
        for demo in DEMO_CONVERSATIONS:
            candidate = persona_for_demo.get(demo["persona"]) or next(
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
            f"Seeded {len(users)} users (incl. {len(DEMO_PERSONAS)} named personas), "
            f"{len(gloeds)} gloeds, {len(vonken)} vonken, 2 vuuren, "
            f"{7 * len(CITIES)} days of metrics, {len(DEMO_CONVERSATIONS)} demo conversations."
        )


if __name__ == "__main__":
    asyncio.run(seed())
