"""Initial normalized finance schema. Revision files remain immutable after deployment."""

from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(80), nullable=False),
        sa.UniqueConstraint("user_id", "name"),
    )
    op.create_index("ix_categories_user_id", "categories", ["user_id"])
    op.create_table(
        "transactions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer,
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "category_id", sa.Integer, sa.ForeignKey("categories.id"), nullable=False
        ),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("payment_mode", sa.String(10), nullable=False),
        sa.Column("note", sa.String(1000), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount > 0"),
        sa.CheckConstraint("kind IN ('income','expense')"),
        sa.CheckConstraint("payment_mode IN ('UPI','Card','Cash','Bank')"),
    )
    op.create_index("ix_transaction_user_date", "transactions", ["user_id", "date"])


def downgrade():
    op.drop_table("transactions")
    op.drop_table("categories")
    op.drop_table("users")
