"""vonk feedback table

Revision ID: 0004_vonk_feedback
Revises: 0003_user_last_name
Create Date: 2026-05-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "0004_vonk_feedback"
down_revision: Union[str, None] = "0003_user_last_name"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vonk_feedback",
        sa.Column("vonk_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("vonken.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("rating", sa.SmallInteger(), nullable=False),  # 1..3 (🔥 / 🔥🔥 / 🔥🔥🔥)
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("would_start_vuur", sa.Boolean(), nullable=False, server_default=sa.text("FALSE")),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_check_constraint(
        "vonk_feedback_rating_range", "vonk_feedback", "rating BETWEEN 1 AND 3"
    )


def downgrade() -> None:
    op.drop_table("vonk_feedback")
