from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..database import get_db
from ..models import User, Transaction, Category
from ..schemas import TransactionInput, TransactionResponse, Payment
from ..security import get_current_user
from ..services.transactions import save_transaction

router = APIRouter(prefix="/transactions", tags=["Transactions"])


def owned(db: Session, user: User, transaction_id: int) -> Transaction:
    row = db.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id, Transaction.user_id == user.id
        )
    )
    if row is None:
        raise HTTPException(404, "Transaction not found.")
    return row


@router.get("", response_model=list[TransactionResponse])
def listing(
    start: Optional[date] = None,
    end: Optional[date] = None,
    category: Optional[str] = None,
    payment_mode: Optional[Payment] = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(10000, ge=1, le=10000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Optional[str] means str OR None; list[TransactionResponse] describes every returned element.
    if start and end and start > end:
        raise HTTPException(422, "Start date must precede end date.")
    query = select(Transaction).where(Transaction.user_id == user.id)
    if start:
        query = query.where(Transaction.date >= start)
    if end:
        query = query.where(Transaction.date <= end)
    if category:
        query = query.join(
            Category,
            (Transaction.category_id == Category.id)
            & (Transaction.user_id == Category.user_id),
        ).where(Category.name == category)
    if payment_mode:
        query = query.where(Transaction.payment_mode == payment_mode)
    return db.scalars(
        query.order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(offset)
        .limit(limit)
    ).all()


@router.post("", response_model=TransactionResponse, status_code=201)
def create(
    data: TransactionInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return save_transaction(db, user, data)


@router.put("/{transaction_id}", response_model=TransactionResponse)
def update(
    transaction_id: int,
    data: TransactionInput,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return save_transaction(db, user, data, owned(db, user, transaction_id))


@router.delete("/{transaction_id}", status_code=204)
def delete(
    transaction_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    db.delete(owned(db, user, transaction_id))
    db.commit()
    return Response(status_code=204)
