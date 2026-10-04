import { Wallet, ArrowDownLeft, ArrowUpRight, TrendingUp } from "lucide-react";
import type { Transaction } from "../types";
import { money } from "../utils/money";
interface Props {
  balance: number;
  income: number;
  expense: number;
  savings: number;
  monthly: Transaction[];
}
// Presentational components receive derived values as props. They never fetch or mutate records.
export function StatCards({
  balance,
  income,
  expense,
  savings,
  monthly,
}: Props) {
  return (
    <div className="stats-grid">
      {[
        {
          label: "Total balance",
          value: money(balance),
          sub: "Net balance through this month",
          icon: Wallet,
          tone: "purple",
        },
        {
          label: "Monthly income",
          value: money(income),
          sub: `${monthly.filter((r) => r.kind === "income").length} income transactions`,
          icon: ArrowDownLeft,
          tone: "cyan",
        },
        {
          label: "Monthly spent",
          value: money(expense),
          sub: `${monthly.filter((r) => r.kind === "expense").length} expense transactions`,
          icon: ArrowUpRight,
          tone: "rose",
        },
        {
          label: "Savings rate",
          value: income ? `${savings.toFixed(1)}%` : "—",
          sub: income
            ? `${money(income - expense)} left from income`
            : "Add income to see your savings",
          icon: TrendingUp,
          tone: "green",
        },
      ].map(({ label, value, sub, icon: Icon, tone }) => (
        <section className={`stat-card ${tone}`} key={label}>
          <div className="stat-top">
            <span>{label}</span>
            <span className="stat-icon">
              <Icon size={19} />
            </span>
          </div>
          <h2>{value}</h2>
          <div className="stat-foot">
            {tone === "green" && income > 0 ? (
              <span className="mini-indicator">
                <TrendingUp size={13} />
              </span>
            ) : (
              <span className={`stat-dot ${tone}`} />
            )}
            <span>{sub}</span>
          </div>
        </section>
      ))}
    </div>
  );
}
