// Interfaces are compile-time contracts. API data still needs server-side Pydantic validation.
export interface Transaction {
  id: number;
  amount: string;
  category: string;
  kind: "income" | "expense";
  date: string;
  payment_mode: "UPI" | "Card" | "Cash" | "Bank";
  note: string;
}
export type TransactionInput = Omit<Transaction, "id">;
export interface User {
  id: number;
  name: string;
  email: string;
}
export interface Receipt {
  amount: string;
  category: string;
  payment_mode: Transaction["payment_mode"];
  note: string;
  date: string;
  items: { name: string; amount: string }[];
}
export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}
