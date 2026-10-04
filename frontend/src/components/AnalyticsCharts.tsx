import { Empty } from "antd";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import dayjs from "dayjs";
import { colors } from "../demo";
import { money } from "../utils/money";
interface Props {
  month: string;
  expense: number;
  breakdown: { name: string; value: number }[];
  trend: { day: number; income: number; expense: number }[];
}
// Chart props are typed at the boundary so incorrect data shapes fail during compilation.
export function AnalyticsCharts({ month, expense, breakdown, trend }: Props) {
  return (
    <div className="charts-grid">
      <section className="panel trend-panel">
        <div className="panel-heading">
          <div>
            <h3>Cash flow</h3>
            <p>Your cumulative income and spending this month</p>
          </div>
          <span className="chart-period">Monthly</span>
        </div>
        <div className="chart-legend">
          <span>
            <i style={{ background: "#8b5cf6" }} />
            Income
          </span>
          <span>
            <i style={{ background: "#06b6d4" }} />
            Expenses
          </span>
        </div>
        <div className="area-chart">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trend}
              margin={{ top: 15, right: 12, left: 0, bottom: 5 }}
            >
              <defs>
                <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.13} />
                  <stop offset="100%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="#2c243e"
                strokeDasharray="3 5"
                vertical={false}
              />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#938aa9", fontSize: 12 }}
                interval={5}
                tickFormatter={(v) =>
                  `${String(v).padStart(2, "0")} ${dayjs(month).format("MMM")}`
                }
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#938aa9", fontSize: 12 }}
                tickFormatter={(v) => (v >= 1000 ? `₹${v / 1000}k` : `₹${v}`)}
                width={54}
              />
              <Tooltip
                contentStyle={{
                  background: "#231c35",
                  border: "1px solid #46355f",
                  borderRadius: 10,
                }}
                formatter={(value: number, name: string) => [
                  money(value),
                  name === "income" ? "Income" : "Expenses",
                ]}
                labelFormatter={(v) =>
                  dayjs(`${month}-${String(v).padStart(2, "0")}`).format(
                    "D MMMM",
                  )
                }
              />
              <Area
                type="monotone"
                dataKey="income"
                stroke="#9b75ff"
                strokeWidth={2.5}
                fill="url(#incomeFill)"
              />
              <Area
                type="monotone"
                dataKey="expense"
                stroke="#06b6d4"
                strokeWidth={2.5}
                fill="url(#expenseFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="panel breakdown-panel">
        <div className="panel-heading">
          <div>
            <h3>Where it goes</h3>
            <p>Expenses by category</p>
          </div>
          <span className="small-muted">{breakdown.length} categories</span>
        </div>
        {breakdown.length ? (
          <>
            <div className="donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={breakdown}
                    dataKey="value"
                    innerRadius={66}
                    outerRadius={88}
                    paddingAngle={4}
                    stroke="none"
                    startAngle={90}
                    endAngle={-270}
                  >
                    {breakdown.map((r, i) => (
                      <Cell
                        key={r.name}
                        fill={colors[r.name] || ["#94a3b8", "#34d399"][i % 2]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => money(value)}
                    contentStyle={{
                      background: "#231c35",
                      border: "1px solid #46355f",
                      borderRadius: 10,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <span>Total spent</span>
                <strong>{money(expense)}</strong>
              </div>
            </div>
            <div className="category-legend">
              {breakdown.slice(0, 4).map((r) => (
                <div key={r.name}>
                  <span>
                    <i style={{ background: colors[r.name] || "#94a3b8" }} />
                    {r.name}
                  </span>
                  <strong>
                    {((r.value / expense) * 100).toFixed(0)}%{" "}
                    <em>{money(r.value)}</em>
                  </strong>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Empty description="No expenses this month" />
        )}
      </section>
    </div>
  );
}
