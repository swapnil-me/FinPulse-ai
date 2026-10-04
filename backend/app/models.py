from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import (
    String,
    ForeignKey,
    ForeignKeyConstraint,
    Numeric,
    Date,
    DateTime,
    UniqueConstraint,
    CheckConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    # One user has many transactions. back_populates makes the relationship bidirectional.
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="Transaction.user_id",
    )
    categories: Mapped[list["Category"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name"),
        UniqueConstraint("id", "user_id", name="uq_category_id_owner"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    user: Mapped[User] = relationship(back_populates="categories")
    transactions: Mapped[list["Transaction"]] = relationship(
        back_populates="category_ref", foreign_keys="Transaction.category_id"
    )


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        # This composite FK prevents a row from linking to another user's category, even in direct SQL.
        ForeignKeyConstraint(
            ["category_id", "user_id"],
            ["categories.id", "categories.user_id"],
            name="fk_transaction_category_owner",
        ),
        CheckConstraint("amount > 0"),
        CheckConstraint("kind IN ('income','expense')"),
        CheckConstraint("payment_mode IN ('UPI','Card','Cash','Bank')"),
        Index("ix_transaction_user_date", "user_id", "date"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    # Decimal + NUMERIC avoids floating-point money errors such as 0.1 + 0.2 != 0.3.
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    kind: Mapped[str] = mapped_column(String(10))
    date: Mapped[date] = mapped_column(Date)
    payment_mode: Mapped[str] = mapped_column(String(10))
    note: Mapped[str] = mapped_column(String(1000), default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    user: Mapped[User] = relationship(back_populates="transactions")
    category_ref: Mapped[Category] = relationship(
        back_populates="transactions", lazy="joined", foreign_keys=[category_id]
    )

    @property
    def category(self) -> str:
        # A property exposes a convenient API field without duplicating database data.
        return self.category_ref.name


class AuthSession(Base):
    """One user can have multiple independently revocable device sessions."""

    __tablename__ = "auth_sessions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    refresh_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
