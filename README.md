# Vonk

> Find your fire.

Vonk ("spark" in Dutch) is a municipal social connection platform. Citizens broadcast a **gloed** (a glow — what they're looking for right now); compatible neighbours form a **vonk** (a 2-6 person micro-gathering within 24 hours); repeated vonken become a **vuur** (a recurring fire).

This repo contains the backend API and citizen web app, plus a municipality dashboard. The same backend serves three channels — web (this app), WhatsApp, and voice — through a unified webhook surface.

## Quickstart

```bash
cp .env.example .env
# Edit .env and fill in ANTHROPIC_API_KEY
docker compose up --build -d
docker compose exec backend python -m scripts.seed
```

Then open:
- Citizen app: http://localhost:3000
- Dashboard: http://localhost:3000/dashboard
- API docs: http://localhost:8000/docs
- Health: http://localhost:8000/health

## Vocabulary

| Concept | Dutch | Meaning |
|---|---|---|
| Your broadcast | Gloed | What you're looking for right now |
| Your signal | Rook (smoke) | Expressing interest in someone's gloed |
| Micro-gathering | Vonk | 2-6 people, within 24 hours |
| Recurring group | Vuur | A vonk that became a community |
| Past gathering | As (ash) | Warm memories, not loss |
