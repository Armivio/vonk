"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0001_initial"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), unique=True),
        sa.Column("email", sa.String(255), unique=True),
        sa.Column("password_hash", sa.String(255)),
        sa.Column("client_id", sa.String(64), unique=True),
        sa.Column("channel", sa.String(20), nullable=False, server_default="web"),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("city", sa.String(100)),
        sa.Column("neighborhood", sa.String(100)),
        sa.Column("age_group", sa.String(20)),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("last_active", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_users_location", "users", ["city", "neighborhood"])

    op.create_table(
        "gloeds",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("raw_input", sa.Text(), nullable=False),
        sa.Column("ai_parsed", sa.Text()),
        sa.Column("category", sa.String(50)),
        sa.Column("energy_level", sa.String(20)),
        sa.Column("group_size_pref", sa.String(20)),
        sa.Column("time_preference", sa.String(50)),
        sa.Column("latitude", sa.Float()),
        sa.Column("longitude", sa.Float()),
        sa.Column("radius_km", sa.Float(), server_default="5.0"),
        sa.Column("active", sa.Boolean(), server_default=sa.true()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True)),
    )
    op.execute(
        "CREATE INDEX idx_gloeds_active ON gloeds(active, latitude, longitude) WHERE active = TRUE"
    )

    op.create_table(
        "vonken",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("creator_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("category", sa.String(50)),
        sa.Column("location_name", sa.String(200)),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("scheduled_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("max_participants", sa.Integer(), server_default="6"),
        sa.Column("status", sa.String(20), server_default="open"),
        sa.Column("ai_suggested", sa.Boolean(), server_default=sa.false()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )
    op.create_index("idx_vonken_status", "vonken", ["status", "scheduled_at", "latitude", "longitude"])

    op.create_table(
        "vonk_participants",
        sa.Column("vonk_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vonken.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("joined_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("attended", sa.Boolean()),
    )

    op.create_table(
        "vuuren",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "vuur_members",
        sa.Column("vuur_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vuuren.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("joined_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "ai_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("messages", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("resulting_gloed_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("gloeds.id")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
    )

    op.create_table(
        "connection_metrics",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("city", sa.String(100), nullable=False),
        sa.Column("neighborhood", sa.String(100)),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("vonken_count", sa.Integer(), server_default="0"),
        sa.Column("unique_participants", sa.Integer(), server_default="0"),
        sa.Column("repeat_participants", sa.Integer(), server_default="0"),
        sa.Column("vuuren_formed", sa.Integer(), server_default="0"),
        sa.Column("cross_age_vonken", sa.Integer(), server_default="0"),
        sa.Column("avg_time_to_first_vonk", sa.Interval()),
        sa.UniqueConstraint("city", "neighborhood", "date", name="uq_metrics_city_neighborhood_date"),
    )


def downgrade() -> None:
    op.drop_table("connection_metrics")
    op.drop_table("ai_conversations")
    op.drop_table("vuur_members")
    op.drop_table("vuuren")
    op.drop_table("vonk_participants")
    op.drop_index("idx_vonken_status", table_name="vonken")
    op.drop_table("vonken")
    op.execute("DROP INDEX IF EXISTS idx_gloeds_active")
    op.drop_table("gloeds")
    op.drop_index("idx_users_location", table_name="users")
    op.drop_table("users")
