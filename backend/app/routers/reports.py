import calendar
import csv
import io
from datetime import date
from decimal import Decimal
from xml.sax.saxutils import escape
from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    LongTable,
    TableStyle,
)
from ..database import get_db
from ..models import User, Transaction
from ..security import get_current_user
from typing import Literal

router = APIRouter(tags=["Reports"])


def safe_cell(value: str) -> str:
    # Spreadsheet apps interpret leading =,+,-,@ as formulas; neutralize user-controlled cells.
    return (
        "'" + value
        if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r"))
        else value
    )


@router.get("/reports")
def export(
    month: str = Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
    format: Literal["csv", "pdf"] = "csv",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    year, number = map(int, month.split("-"))
    if not 1900 <= year <= 9999:
        from fastapi import HTTPException

        raise HTTPException(422, "Invalid report year.")
    start, end = date(year, number, 1), date(
        year, number, calendar.monthrange(year, number)[1]
    )
    rows = db.scalars(
        select(Transaction)
        .where(
            Transaction.user_id == user.id,
            Transaction.kind == "expense",
            Transaction.date.between(start, end),
        )
        .order_by(Transaction.date)
    ).all()
    headings = ["Date", "Category", "Amount (INR)", "Payment", "Notes"]
    values = [
        [str(r.date), r.category, str(r.amount), r.payment_mode, r.note] for r in rows
    ]
    filename = f"finpulse-expenses-{month}.{format}"
    if format == "csv":
        buffer = io.StringIO(newline="")
        writer = csv.writer(buffer)
        writer.writerow(headings)
        writer.writerows([[safe_cell(cell) for cell in row] for row in values])
        content, media = buffer.getvalue().encode("utf-8-sig"), "text/csv"
    else:
        buffer = io.BytesIO()
        styles = getSampleStyleSheet()
        paragraphs = [
            [Paragraph(escape(cell), styles["BodyText"]) for cell in row]
            for row in [headings] + values
        ]
        table = LongTable(paragraphs, colWidths=[65, 75, 85, 60, 210], repeatRows=1)
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ddd0ff")),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                    ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.lightgrey),
                ]
            )
        )
        total = sum((r.amount for r in rows), Decimal("0"))
        SimpleDocTemplate(buffer, title="FinPulse expense report").build(
            [
                Paragraph(f"FinPulse AI | Expenses {month}", styles["Title"]),
                Paragraph(
                    f"Total: INR {total:,.2f} | {len(rows)} expenses", styles["Normal"]
                ),
                Spacer(1, 20),
                table,
            ]
        )
        content, media = buffer.getvalue(), "application/pdf"
    return Response(
        content,
        media_type=media,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
