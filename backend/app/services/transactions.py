from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..models import Category, Transaction, User
from ..schemas import TransactionInput

CATEGORIES = [
    "Food",
    "Rent",
    "Bills",
    "Travel",
    "Shopping",
    "Entertainment",
    "Health",
    "Education",
    "Other",
    "Salary",
    "Freelance",
]


def save_transaction(
    db: Session, user: User, data: TransactionInput, existing: Transaction | None = None
) -> Transaction:
    if existing is not None and existing.user_id != user.id:
        raise HTTPException(404, "Transaction not found.")
    # The authenticated user determines ownership; a client cannot submit another user's ID.
    category = db.scalar(
        select(Category).where(
            Category.user_id == user.id, Category.name == data.category
        )
    )
    if category is None:
        raise HTTPException(422, "Choose one of your available categories.")
    row = existing or Transaction(user_id=user.id)
    for field, value in data.model_dump(exclude={"category"}).items():
        setattr(row, field, value)
    row.category_ref = category
    db.add(row)
    db.commit()  # One atomic commit is the persistence boundary.
    db.refresh(row)
    return row
