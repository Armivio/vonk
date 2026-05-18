"""user last name column

Revision ID: 0003_user_last_name
Revises: 0002_user_preferences
Create Date: 2026-05-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_user_last_name"
down_revision: Union[str, None] = "0002_user_preferences"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "last_name")
