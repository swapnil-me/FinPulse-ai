import type { Transaction } from "./types";
// Fictional sample data is deliberately separate from production API code. Demo changes are temporary.
const month = new Date().toISOString().slice(0, 7);
const row = (
  id: number,
  amount: number,
  category: string,
  note: string,
  day: number,
  payment_mode: Transaction["payment_mode"] = "UPI",
  kind: Transaction["kind"] = "expense",
): Transaction => ({
  id,
  amount: String(amount),
  category,
  note,
  date: `${month}-${String(day).padStart(2, "0")}`,
  payment_mode,
  kind,
});
export const demoTransactions: Transaction[] = [
  row(1, 85000, "Salary", "Monthly salary", 1, "Bank", "income"),
  row(2, 12000, "Freelance", "Website project", 12, "Bank", "income"),
  row(3, 18000, "Rent", "Apartment rent", 2, "Bank"),
  row(4, 2450, "Food", "Weekly groceries", 4, "Card"),
  row(5, 1299, "Shopping", "Amazon · desk essentials", 6, "Card"),
  row(6, 850, "Travel", "Uber · weekend rides", 8),
  row(7, 2499, "Bills", "Electricity bill", 10),
  row(8, 1800, "Food", "Dinner with friends", 13),
  row(9, 999, "Entertainment", "Netflix subscription", 15, "Card"),
  row(10, 3200, "Shopping", "New running shoes", 18, "Card"),
  row(11, 650, "Food", "Blue Tokai Coffee", 21),
  row(12, 1200, "Travel", "Metro recharge", 23),
  row(13, 1599, "Bills", "Internet recharge", 25),
  row(14, 450, "Food", "Lunch at work", 26),
  row(15, 799, "Entertainment", "Movie night", 27),
  row(16, 1850, "Food", "Fresh groceries", 28),
];
export const categories = [
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
];
export const colors: Record<string, string> = {
  Food: "#a78bfa",
  Rent: "#7c3aed",
  Bills: "#06b6d4",
  Travel: "#fbbf24",
  Shopping: "#f472b6",
  Entertainment: "#60a5fa",
  Health: "#34d399",
  Other: "#94a3b8",
};
