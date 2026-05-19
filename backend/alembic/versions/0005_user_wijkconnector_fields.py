"""user wijkconnector-context fields

Revision ID: 0005_user_wijkconnector_fields
Revises: 0004_vonk_feedback
Create Date: 2026-05-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_user_wijkconnector_fields"
down_revision: Union[str, None] = "0004_vonk_feedback"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("registered_by_name", sa.String(100), nullable=True))
    op.add_column("users", sa.Column("registered_by_org", sa.String(100), nullable=True))
    op.add_column(
        "users",
        sa.Column("contact_preference", sa.String(20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("users", "contact_preference")
    op.drop_column("users", "registered_by_org")
    op.drop_column("users", "registered_by_name")
