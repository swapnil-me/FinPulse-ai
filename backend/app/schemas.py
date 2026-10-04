from datetime import date
from decimal import Decimal
from typing import Annotated, Literal, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Money = Annotated[Decimal, Field(gt=0, max_digits=14, decimal_places=2)]
Payment = Literal["UPI", "Card", "Cash", "Bank"]


class Register(BaseModel):
    model_config = ConfigDict(extra="forbid")
    # BaseModel validates untrusted JSON before business logic sees it. Wrong types yield HTTP 422.
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name is required")
        return value.strip()

    @field_validator("password")
    @classmethod
    def bcrypt_byte_limit(cls, value: str) -> str:
        if len(value.encode("utf-8")) > 72:
            raise ValueError("Password must be at most 72 UTF-8 bytes")
        return value


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=72)

    # Apply the bcrypt byte limit to login too; never silently truncate a multibyte password.
    @field_validator("password")
    @classmethod
    def password_bytes(cls, value: str) -> str:
        return Register.bcrypt_byte_limit(value)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    email: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class TransactionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    amount: Money
    category: str = Field(min_length=1, max_length=80)
    kind: Literal["income", "expense"] = "expense"
    date: date
    payment_mode: Payment
    note: str = Field(default="", max_length=1000)


class TransactionResponse(TransactionInput):
    # from_attributes reads ORM object attributes instead of requiring a dictionary.
    model_config = ConfigDict(from_attributes=True)
    id: int


class TextInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(min_length=3, max_length=2000)


class ExpenseExtraction(BaseModel):
    amount: Money
    category: str = Field(min_length=1, max_length=80)
    payment_mode: Payment
    note: str = Field(max_length=1000)
    date: date


class ReceiptItem(BaseModel):
    name: str = Field(max_length=200)
    amount: Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2)]


class ReceiptExtraction(ExpenseExtraction):
    items: list[ReceiptItem] = Field(max_length=100)


class AdviceResponse(BaseModel):
    answer: str = Field(min_length=1, max_length=6000)


class PasswordChange(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: str = Field(min_length=1, max_length=72)
    new_password: str = Field(min_length=12, max_length=72)

    @field_validator("new_password")
    @classmethod
    def valid_password(cls, value: str) -> str:
        return Register.bcrypt_byte_limit(value)
