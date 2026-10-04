"""Add revocable sessions and a database ownership constraint without rewriting existing data."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "auth_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("refresh_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_auth_sessions_user_id", "auth_sessions", ["user_id"])
    op.create_unique_constraint("uq_category_id_owner", "categories", ["id", "user_id"])
    # Fail safely if legacy rows violate ownership. Never silently reassign another user's records.
    op.create_foreign_key(
        "fk_transaction_category_owner",
        "transactions",
        "categories",
        ["category_id", "user_id"],
        ["id", "user_id"],
    )


def downgrade():
    op.drop_constraint(
        "fk_transaction_category_owner", "transactions", type_="foreignkey"
    )
    op.drop_constraint("uq_category_id_owner", "categories", type_="unique")
    op.drop_table("auth_sessions")
