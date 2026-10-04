import { useEffect, useMemo, useState } from "react";
import {
  App as AntApp,
  Button,
  DatePicker,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Segmented,
  Spin,
  Table,
  Tag,
  Upload,
  Alert,
} from "antd";
import {
  Activity,
  LayoutDashboard,
  ArrowLeftRight,
  ChartNoAxesCombined,
  Sparkles,
  FileDown,
  Settings,
  ChevronLeft,
  ChevronRight,
  Plus,
  ScanLine,
  Search,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  Send,
  CreditCard,
  Utensils,
  ShoppingBag,
  House,
  Car,
  Film,
  Zap,
  MoreHorizontal,
  X,
  Menu,
  LogOut,
  Download,
  FileText,
  CircleHelp,
  CalendarDays,
  Check,
  ShieldCheck,
} from "lucide-react";
import { StatCards } from "./components/StatCards";
import { AnalyticsCharts } from "./components/AnalyticsCharts";
import { money } from "./utils/money";
import dayjs from "dayjs";
import { api, DEMO, restoreSession, SESSION_CLEARED } from "./api";
import { AccountSecurity } from "./components/AccountSecurity";
import { categories, colors, demoTransactions } from "./demo";
import type {
  Transaction,
  TransactionInput,
  User,
  ChatMessage,
  Receipt,
} from "./types";

const iconFor = (category: string) =>
  ({
    Food: Utensils,
    Rent: House,
    Travel: Car,
    Shopping: ShoppingBag,
    Entertainment: Film,
    Bills: Zap,
  })[category] || Wallet;
const navigation = [
  { name: "Overview", icon: LayoutDashboard },
  { name: "Transactions", icon: ArrowLeftRight },
  { name: "Analytics", icon: ChartNoAxesCombined },
  { name: "AI Advisor", icon: Sparkles },
  { name: "Reports", icon: FileDown },
];
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function App() {
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    const reset = () => setGeneration((old) => old + 1);
    window.addEventListener(SESSION_CLEARED, reset);
    return () => window.removeEventListener(SESSION_CLEARED, reset);
  }, []);
  // A fresh key destroys every old-account state variable, including hidden drawers and form drafts.
  return <Workspace key={generation} />;
}

function Workspace() {
  const { message } = AntApp.useApp();
  // useState stores values between renders. Functional setters avoid stale state in async callbacks.
  const [user, setUser] = useState<User | null>(
    DEMO
      ? { id: 0, name: "Alex Morgan", email: "demo@finpulse.example" }
      : null,
  );
  const [restoring, setRestoring] = useState(!DEMO);
  const [rows, setRows] = useState<Transaction[]>(DEMO ? demoTransactions : []);
  const [page, setPage] = useState("Overview");
  const [month, setMonth] = useState(dayjs().format("YYYY-MM"));
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState<Transaction | null>(null);
  const [modal, setModal] = useState(false);
  const [scan, setScan] = useState(false);
  const [advisor, setAdvisor] = useState(false);
  const [settings, setSettings] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [logText, setLogText] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [category, setCategory] = useState<string>();
  const [payment, setPayment] = useState<string>();
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<[string, string] | null>(null);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [form] = Form.useForm();
  const [authForm] = Form.useForm();

  useEffect(() => {
    if (DEMO) return;
    let active = true;
    restoreSession()
      .then((next) => {
        if (active) setUser(next);
      })
      .catch((e) => {
        if (active) message.error(e.message);
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // useEffect synchronizes React with the API. Cleanup prevents late responses updating an unmounted screen.
  useEffect(() => {
    if (DEMO || !user) return;
    let active = true;
    setLoading(true);
    api
      .transactions()
      .then((data) => {
        if (active) {
          setRows(data);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const monthly = useMemo(
    () => rows.filter((r) => r.date.startsWith(month)),
    [rows, month],
  );
  const income = monthly
    .filter((r) => r.kind === "income")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const expense = monthly
    .filter((r) => r.kind === "expense")
    .reduce((sum, r) => sum + Number(r.amount), 0);
  const balance = rows
    .filter((r) => r.date <= dayjs(month).endOf("month").format("YYYY-MM-DD"))
    .reduce(
      (sum, r) => sum + Number(r.amount) * (r.kind === "income" ? 1 : -1),
      0,
    );
  const savings = income ? ((income - expense) / income) * 100 : 0;
  const breakdown = categories
    .map((name) => ({
      name,
      value: monthly
        .filter((r) => r.kind === "expense" && r.category === name)
        .reduce((sum, r) => sum + Number(r.amount), 0),
    }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const trend = Array.from({ length: dayjs(month).daysInMonth() }, (_, i) => {
    const date = `${month}-${String(i + 1).padStart(2, "0")}`;
    return {
      day: i + 1,
      expense: monthly
        .filter((r) => r.date <= date && r.kind === "expense")
        .reduce((s, r) => s + Number(r.amount), 0),
      income: monthly
        .filter((r) => r.date <= date && r.kind === "income")
        .reduce((s, r) => s + Number(r.amount), 0),
    };
  });
  const filtered = monthly
    .filter(
      (r) =>
        (!category || r.category === category) &&
        (!payment || r.payment_mode === payment) &&
        (!range || (r.date >= range[0] && r.date <= range[1])) &&
        `${r.note} ${r.category}`.toLowerCase().includes(search.toLowerCase()),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  function openForm(row?: Transaction) {
    setEdit(row || null);
    setReceipt(null);
    form.resetFields();
    form.setFieldsValue(
      row
        ? { ...row, amount: Number(row.amount), date: dayjs(row.date) }
        : {
            kind: "expense",
            date: dayjs(),
            payment_mode: "UPI",
            category: "Food",
          },
    );
    setModal(true);
  }
  async function save(values: any) {
    setBusy(true);
    const data: TransactionInput = {
      ...values,
      amount: Number(values.amount).toFixed(2),
      date: values.date.format("YYYY-MM-DD"),
      note: values.note || "",
    };
    try {
      const saved = DEMO
        ? { ...data, id: edit?.id || Date.now() }
        : await api.save(data, edit?.id);
      setRows((old) =>
        edit ? old.map((r) => (r.id === edit.id ? saved : r)) : [saved, ...old],
      );
      setModal(false);
      message.success(
        DEMO
          ? "Sample transaction updated · resets on refresh"
          : "Transaction saved",
      );
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: number) {
    try {
      if (!DEMO) await api.remove(id);
      setRows((old) => old.filter((r) => r.id !== id));
      message.success("Transaction removed");
    } catch (e) {
      message.error((e as Error).message);
    }
  }
  async function logExpense() {
    if (!logText.trim()) return;
    if (DEMO) {
      message.info(
        "Live AI logging needs the configured backend. You can try Quick Log in this preview.",
      );
      return;
    }
    setAiBusy(true);
    try {
      const row = await api.log(logText);
      setRows((old) => [row, ...old]);
      setLogText("");
      message.success("Expense logged");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  async function scanFile(file: File) {
    if (DEMO) {
      message.info(
        "Receipt extraction is available when the Gemini backend is connected.",
      );
      return false;
    }
    setBusy(true);
    try {
      const result = await api.scan(file);
      setReceipt(result);
      setScan(false);
      setEdit(null);
      form.setFieldsValue({
        ...result,
        amount: Number(result.amount),
        kind: "expense",
        date: dayjs(result.date),
      });
      setModal(true);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
    return false;
  }
  async function ask(text = chatInput) {
    if (!text.trim()) return;
    setChat((old) => [...old, { role: "user", text }]);
    setChatInput("");
    setAiBusy(true);
    try {
      const answer = DEMO
        ? `Sample insight, calculated from the displayed data: ${breakdown[0]?.name || "No expenses"} is your largest expense category${breakdown[0] ? ` at ${money(breakdown[0].value)}` : ""}. This month's recorded income is ${money(income)} and spending is ${money(expense)}. Review flexible categories such as Food, Shopping and Entertainment to choose a realistic reduction. Connect the backend for Gemini-powered advice tailored to your question.`
        : (await api.chat(text)).answer;
      setChat((old) => [...old, { role: "assistant", text: answer }]);
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  }
  async function exportReport(format: "csv" | "pdf") {
    if (DEMO && format === "pdf") {
      message.info(
        "PDF reports are generated by the Python backend. CSV is available in this preview.",
      );
      return;
    }
    setBusy(true);
    try {
      let blob: Blob;
      if (DEMO) {
        const escape = (v: string) =>
          '"' +
          (/^[=+@\-\s]/.test(v) ? "'" : "") +
          v.replaceAll('"', '""') +
          '"';
        const lines = [
          ["Date", "Category", "Amount (INR)", "Payment", "Notes"],
          ...monthly
            .filter((r) => r.kind === "expense")
            .map((r) => [r.date, r.category, r.amount, r.payment_mode, r.note]),
        ];
        blob = new Blob(
          [
            "\ufeff" +
              lines.map((row) => row.map(escape).join(",")).join("\r\n"),
          ],
          { type: "text/csv" },
        );
      } else blob = await api.export(month, format);
      download(blob, `finpulse-expenses-${month}.${format}`);
      message.success("Report downloaded");
    } catch (e) {
      message.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const columns = [
    {
      title: "TRANSACTION",
      dataIndex: "note",
      key: "note",
      render: (note: string, r: Transaction) => {
        const Icon = iconFor(r.category);
        return (
          <div className="transaction-name">
            <span
              className="category-icon"
              style={{
                color: colors[r.category] || "#34d399",
                background: (colors[r.category] || "#34d399") + "15",
              }}
            >
              <Icon size={18} />
            </span>
            <div>
              <strong>{note || r.category}</strong>
              <small>
                {r.kind === "income" ? "Money received" : "Payment completed"}
              </small>
            </div>
          </div>
        );
      },
    },
    {
      title: "CATEGORY",
      dataIndex: "category",
      key: "category",
      render: (value: string) => (
        <Tag
          bordered={false}
          style={{
            color: colors[value] || "#b5a7d3",
            background: (colors[value] || "#b5a7d3") + "15",
          }}
        >
          {value}
        </Tag>
      ),
    },
    {
      title: "DATE",
      dataIndex: "date",
      key: "date",
      render: (value: string) => dayjs(value).format("DD MMM, YYYY"),
    },
    {
      title: "PAYMENT",
      dataIndex: "payment_mode",
      key: "payment",
      render: (value: string) => (
        <span className="payment">
          <CreditCard size={14} />
          {value}
        </span>
      ),
    },
    {
      title: "STATUS",
      key: "status",
      render: () => (
        <Tag bordered={false} color="green">
          Completed
        </Tag>
      ),
    },
    {
      title: "AMOUNT",
      key: "amount",
      align: "right" as const,
      render: (_: unknown, r: Transaction) => (
        <strong className={r.kind === "income" ? "positive" : "amount"}>
          {r.kind === "income" ? "+" : "−"}
          {money(Number(r.amount))}
        </strong>
      ),
    },
    {
      title: "",
      key: "actions",
      width: 72,
      render: (_: unknown, r: Transaction) => (
        <Dropdown
          menu={{
            items: [
              {
                key: "edit",
                label: "Edit transaction",
                onClick: () => openForm(r),
              },
              {
                key: "delete",
                label: (
                  <Popconfirm
                    title="Delete this transaction?"
                    onConfirm={() => remove(r.id)}
                    okText="Delete"
                  >
                    <span>Delete transaction</span>
                  </Popconfirm>
                ),
                danger: true,
              },
            ],
          }}
          trigger={["click"]}
        >
          <Button
            type="text"
            aria-label={`Actions for ${r.note}`}
            icon={<MoreHorizontal size={18} />}
          />
        </Dropdown>
      ),
    },
  ];

  if (restoring)
    return (
      <div className="auth-screen">
        <Spin tip="Restoring your secure session">
          <div style={{ padding: 50 }}>FinPulse AI</div>
        </Spin>
      </div>
    );

  if (!user)
    return (
      <div className="auth-screen">
        <div className="auth-card">
          <div className="brand">
            <span className="brand-mark">
              <Activity />
            </span>
            FinPulse <b>AI</b>
          </div>
          <h1>
            {authMode === "login" ? "Welcome back." : "Make money make sense."}
          </h1>
          <p>
            {authMode === "login"
              ? "Sign in to your financial workspace."
              : "Create your private finance workspace."}
          </p>
          <Form
            form={authForm}
            layout="vertical"
            onFinish={async (values) => {
              setBusy(true);
              try {
                setUser(await api.authenticate(authMode, values));
              } catch (e) {
                message.error((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {authMode === "register" && (
              <Form.Item
                label="Full name"
                name="name"
                rules={[{ required: true, whitespace: true, max: 100 }]}
              >
                <Input autoComplete="name" />
              </Form.Item>
            )}
            <Form.Item
              label="Email"
              name="email"
              rules={[{ required: true, type: "email" }]}
            >
              <Input autoComplete="email" />
            </Form.Item>
            <Form.Item
              label="Password"
              name="password"
              rules={[
                {
                  required: true,
                  min: authMode === "register" ? 12 : 1,
                  max: 72,
                },
              ]}
            >
              <Input.Password
                autoComplete={
                  authMode === "login" ? "current-password" : "new-password"
                }
              />
            </Form.Item>
            <Button htmlType="submit" type="primary" block loading={busy}>
              {authMode === "login" ? "Sign in" : "Create account"}
            </Button>
          </Form>
          <Button
            type="link"
            block
            onClick={() =>
              setAuthMode(authMode === "login" ? "register" : "login")
            }
          >
            {authMode === "login"
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </Button>
        </div>
      </div>
    );

  return (
    <div className={`app-shell ${collapsed ? "is-collapsed" : ""}`}>
      {mobileOpen && (
        <div
          className="sidebar-backdrop"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <a className="brand" onClick={() => setPage("Overview")}>
          <span className="brand-mark">
            <Activity size={23} />
          </span>
          <span className="brand-text">
            FinPulse <b>AI</b>
          </span>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {navigation.map(({ name, icon: Icon }) => (
            <button
              key={name}
              title={name}
              className={page === name ? "active" : ""}
              onClick={() => {
                if (name === "AI Advisor") setAdvisor(true);
                else setPage(name);
                setMobileOpen(false);
              }}
            >
              <Icon size={20} />
              <span>{name}</span>
              {name === "AI Advisor" && <span className="nav-ai">AI</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="insight-mini">
            <div className="tiny-stars">
              <Sparkles size={18} />
              <span>A little clarity. A lot of possibility.</span>
            </div>
            <p>Better money habits start with knowing your numbers.</p>
            <button onClick={() => setAdvisor(true)}>
              Meet your AI advisor <ChevronRight size={15} />
            </button>
          </div>
          <button className="settings-button" onClick={() => setSettings(true)}>
            <Settings size={19} />
            <span>Settings</span>
          </button>
          <div className="sidebar-user">
            <div className="avatar">
              {user.name
                .split(" ")
                .map((n) => n[0])
                .slice(0, 2)
                .join("")}
            </div>
            <div className="user-text">
              <strong>{user.name}</strong>
              <span>{DEMO ? "Demo workspace" : "Personal account"}</span>
            </div>
            <button
              aria-label="Collapse sidebar"
              onClick={() => setCollapsed(!collapsed)}
            >
              <ChevronLeft size={18} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle"
              aria-label="Open menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={22} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={13} />
            <strong>{page}</strong>
          </div>
          <div className="top-actions">
            <span className="workspace-status">
              {DEMO ? "Sample data" : "Private workspace"}
            </span>
            <button
              className="icon-button"
              aria-label="Help"
              onClick={() => setSettings(true)}
            >
              <CircleHelp size={19} />
            </button>
            <div className="avatar small">{user.name[0]}</div>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">YOUR MONEY, IN FOCUS</div>
              <h1>
                {page === "Overview"
                  ? `Let's make sense of your money.`
                  : page === "Transactions"
                    ? "Every transaction, accounted for."
                    : page === "Analytics"
                      ? "See the story behind your spending."
                      : "Your finances, ready to share."}
              </h1>
              <p>
                {page === "Overview"
                  ? "A clear picture of where you stand. A smarter way to move forward."
                  : page === "Transactions"
                    ? "Track, organize and find your income and expenses."
                    : page === "Analytics"
                      ? "Explore your income, spending patterns and savings."
                      : "Download your monthly expenses as CSV or PDF."}
              </p>
            </div>
            <div className="heading-actions">
              <Button
                icon={<ScanLine size={17} />}
                onClick={() => setScan(true)}
              >
                Scan Bill
              </Button>
              <Button
                type="primary"
                icon={<Plus size={18} />}
                onClick={() => openForm()}
              >
                Quick Log
              </Button>
            </div>
          </div>
          {DEMO && (
            <div className="demo-note">
              <span>INTERACTIVE PREVIEW</span> Explore with sample data. Changes
              reset on refresh.
              <button onClick={() => setSettings(true)}>
                Connect your account <ChevronRight size={13} />
              </button>
            </div>
          )}
          {error && <Alert message={error} type="error" showIcon closable />}
          <div className="section-toolbar">
            <div className="view-label">
              <span className="active-dot" />
              {page === "Overview" ? "Financial overview" : page}
              <span className="period-label">INR</span>
            </div>
            <DatePicker
              picker="month"
              value={dayjs(month)}
              allowClear={false}
              format="MMMM YYYY"
              onChange={(v) => v && setMonth(v.format("YYYY-MM"))}
              suffixIcon={<CalendarDays size={16} />}
            />
          </div>
          <Spin spinning={loading}>
            {(page === "Overview" || page === "Analytics") && (
              <>
                <StatCards
                  balance={balance}
                  income={income}
                  expense={expense}
                  savings={savings}
                  monthly={monthly}
                />
                {page === "Overview" && (
                  <section className="ai-log">
                    <div className="ai-orb">
                      <Sparkles size={23} />
                    </div>
                    <div className="ai-log-content">
                      <div>
                        <strong>Just say it. We'll log it.</strong>
                        <span className="ai-badge">AI POWERED</span>
                      </div>
                      <Input
                        variant="borderless"
                        placeholder="Try “Paid ₹350 for movie tickets on UPI today”"
                        value={logText}
                        onChange={(e) => setLogText(e.target.value)}
                        onPressEnter={logExpense}
                        maxLength={2000}
                      />
                    </div>
                    <Button
                      className="log-button"
                      onClick={logExpense}
                      loading={aiBusy}
                      icon={<Plus size={16} />}
                    >
                      Log expense
                    </Button>
                  </section>
                )}
                <AnalyticsCharts
                  month={month}
                  expense={expense}
                  breakdown={breakdown}
                  trend={trend}
                />
                {page === "Overview" && (
                  <section className="insight-banner">
                    <span className="insight-icon">
                      <Sparkles size={19} />
                    </span>
                    <div>
                      <strong>A little insight for your next move</strong>
                      <p>
                        {expense
                          ? `${breakdown[0]?.name} makes up ${Math.round(((breakdown[0]?.value || 0) / expense) * 100)}% of your spending. Explore where small changes could make a difference.`
                          : "Log your first expense to start discovering your spending patterns."}
                      </p>
                    </div>
                    <Button type="text" onClick={() => setAdvisor(true)}>
                      Explore insights <ChevronRight size={16} />
                    </Button>
                  </section>
                )}
              </>
            )}
            {(page === "Overview" || page === "Transactions") && (
              <section className="panel transactions-panel">
                <div className="panel-heading">
                  <div>
                    <h3>
                      {page === "Overview"
                        ? "Recent transactions"
                        : "All transactions"}{" "}
                      <span className="count-badge">{filtered.length}</span>
                    </h3>
                    <p>Your money on the move</p>
                  </div>
                  {page === "Overview" ? (
                    <Button type="text" onClick={() => setPage("Transactions")}>
                      View all <ChevronRight size={15} />
                    </Button>
                  ) : (
                    <Button
                      icon={<Download size={15} />}
                      onClick={() => exportReport("csv")}
                    >
                      Export CSV
                    </Button>
                  )}
                </div>
                {page === "Transactions" && (
                  <div className="filters">
                    <Input
                      prefix={<Search size={16} />}
                      placeholder="Search transactions"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      allowClear
                    />
                    <Select
                      aria-label="Filter category"
                      placeholder="All categories"
                      value={category}
                      options={categories.map((value) => ({
                        value,
                        label: value,
                      }))}
                      allowClear
                      onChange={setCategory}
                    />
                    <Select
                      aria-label="Filter payment"
                      placeholder="All payments"
                      value={payment}
                      options={["UPI", "Card", "Cash", "Bank"].map((value) => ({
                        value,
                        label: value,
                      }))}
                      allowClear
                      onChange={setPayment}
                    />
                    <DatePicker.RangePicker
                      onChange={(v) =>
                        setRange(
                          v && v[0] && v[1]
                            ? [
                                v[0].format("YYYY-MM-DD"),
                                v[1].format("YYYY-MM-DD"),
                              ]
                            : null,
                        )
                      }
                    />
                  </div>
                )}
                <Table
                  rowKey="id"
                  columns={columns}
                  dataSource={
                    page === "Overview" ? filtered.slice(0, 5) : filtered
                  }
                  pagination={
                    page === "Overview"
                      ? false
                      : {
                          pageSize: 10,
                          showSizeChanger: false,
                          hideOnSinglePage: true,
                        }
                  }
                  scroll={{ x: 700 }}
                  locale={{
                    emptyText: (
                      <Empty description="No transactions found. Add one with Quick Log." />
                    ),
                  }}
                />
              </section>
            )}
            {page === "Reports" && (
              <div className="report-grid">
                {(["csv", "pdf"] as const).map((format) => (
                  <section className="panel report-card" key={format}>
                    <div className="report-icon">
                      {format === "csv" ? (
                        <FileDown size={30} />
                      ) : (
                        <FileText size={30} />
                      )}
                    </div>
                    <h2>{format.toUpperCase()} expense report</h2>
                    <p>
                      {format === "csv"
                        ? "A spreadsheet-ready list of your monthly expenses, categories and payment methods."
                        : "A formatted monthly summary, with itemized expenses and totals."}
                    </p>
                    <div className="report-detail">
                      <span>{dayjs(month).format("MMMM YYYY")}</span>
                      <strong>{money(expense)}</strong>
                    </div>
                    <Button
                      type="primary"
                      icon={<Download size={17} />}
                      loading={busy}
                      onClick={() => exportReport(format)}
                    >
                      Download {format.toUpperCase()}
                    </Button>
                  </section>
                ))}
              </div>
            )}
          </Spin>
          <footer>
            <span>
              <Activity size={14} /> FinPulse AI
            </span>
            <span>A clearer view. A more confident you.</span>
            <span>
              <ShieldCheck size={14} />
              {DEMO ? "Sample workspace" : "Your private workspace"}
            </span>
          </footer>
        </main>
      </div>
      <Modal
        open={modal}
        title={
          edit
            ? "Edit transaction"
            : receipt
              ? "Review scanned receipt"
              : "Quick log a transaction"
        }
        onCancel={() => setModal(false)}
        footer={null}
        destroyOnClose
      >
        <p className="modal-sub">
          {receipt
            ? "Check the extracted values before saving."
            : "Small details. A complete picture."}
        </p>
        {receipt && (
          <div className="receipt-items">
            {receipt.items.map((item, i) => (
              <div key={i}>
                <span>{item.name}</span>
                <strong>{money(Number(item.amount))}</strong>
              </div>
            ))}
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="kind">
            <Segmented
              options={[
                { value: "expense", label: "Expense" },
                { value: "income", label: "Income" },
              ]}
              block
            />
          </Form.Item>
          <div className="form-grid">
            <Form.Item
              label="Amount (₹)"
              name="amount"
              rules={[
                {
                  required: true,
                  type: "number",
                  min: 0.01,
                  max: 999999999999.99,
                },
              ]}
            >
              <InputNumber
                min={0.01}
                precision={2}
                style={{ width: "100%" }}
                placeholder="0.00"
              />
            </Form.Item>
            <Form.Item
              label="Category"
              name="category"
              rules={[{ required: true }]}
            >
              <Select
                options={categories.map((value) => ({ value, label: value }))}
              />
            </Form.Item>
            <Form.Item label="Date" name="date" rules={[{ required: true }]}>
              <DatePicker style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item
              label="Payment method"
              name="payment_mode"
              rules={[{ required: true }]}
            >
              <Select
                options={["UPI", "Card", "Cash", "Bank"].map((value) => ({
                  value,
                  label: value,
                }))}
              />
            </Form.Item>
          </div>
          <Form.Item label="Notes" name="note">
            <Input.TextArea
              rows={3}
              maxLength={1000}
              placeholder="What was it for?"
            />
          </Form.Item>
          <div className="modal-actions">
            <Button onClick={() => setModal(false)}>Cancel</Button>
            <Button type="primary" htmlType="submit" loading={busy}>
              {edit ? "Save changes" : "Save transaction"}
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        title="Turn your receipt into a record"
        open={scan}
        onCancel={() => setScan(false)}
        footer={null}
      >
        <p className="modal-sub">
          Upload a clear photo. Review the extracted items and total before
          saving.
        </p>
        {DEMO && (
          <Alert
            message="Preview mode: connect the backend to scan real receipts."
            type="info"
            showIcon
            style={{ marginBottom: 20 }}
          />
        )}
        <Spin spinning={busy}>
          <Upload.Dragger
            accept="image/png,image/jpeg,image/webp"
            beforeUpload={scanFile}
            showUploadList={false}
          >
            <div className="upload-icon">
              <ScanLine size={40} />
            </div>
            <h3>Drop your receipt here</h3>
            <p>or click to choose a photo</p>
            <p className="small-muted">JPG, PNG or WebP · up to 5 MB</p>
          </Upload.Dragger>
        </Spin>
        <p className="privacy-note">
          <ShieldCheck size={14} /> Your image is sent to Gemini for extraction
          and is not stored by FinPulse.
        </p>
      </Modal>
      <Drawer
        title={
          <span className="drawer-title">
            <Sparkles size={20} /> Your AI money companion
          </span>
        }
        open={advisor}
        onClose={() => setAdvisor(false)}
        width={440}
      >
        <div className="advisor-intro">
          <div className="ai-orb large">
            <Sparkles size={30} />
          </div>
          <h2>Let's find your next smart move.</h2>
          <p>
            Ask about your spending, saving opportunities, or a plan for this
            month.
          </p>
          {DEMO && (
            <Tag color="purple">Sample insights · AI backend not connected</Tag>
          )}
        </div>
        <div className="suggestions">
          {[
            "Where can I save ₹3,000 this month?",
            "What is my biggest expense?",
            "Help me understand my spending",
          ].map((text) => (
            <button key={text} onClick={() => ask(text)} disabled={aiBusy}>
              {text}
              <Plus size={15} />
            </button>
          ))}
        </div>
        <div className="chat-messages">
          {chat.map((item, i) => (
            <div key={i} className={`chat-message ${item.role}`}>
              <small>{item.role === "user" ? "You" : "FinPulse AI"}</small>
              <p>{item.text}</p>
            </div>
          ))}
          {aiBusy && <Spin />}
        </div>
        <div className="chat-input">
          <Input.TextArea
            aria-label="Ask advisor"
            placeholder="Ask about your money…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            maxLength={2000}
            autoSize={{ minRows: 2, maxRows: 5 }}
          />
          <Button
            type="primary"
            aria-label="Send message"
            icon={<Send size={17} />}
            onClick={() => ask()}
            loading={aiBusy}
          />
        </div>
        <p className="small-muted">
          Budgeting guidance, not professional investment advice.
        </p>
      </Drawer>
      <Modal
        title="Your workspace"
        open={settings}
        onCancel={() => setSettings(false)}
        footer={<Button onClick={() => setSettings(false)}>Done</Button>}
      >
        <div className="settings-content">
          <div className="avatar">{user.name[0]}</div>
          <h3>{user.name}</h3>
          <p>{user.email}</p>
          <Alert
            type="info"
            showIcon
            message={
              DEMO
                ? "You are exploring a sample workspace."
                : "Connected to your private FastAPI account."
            }
            description={
              DEMO
                ? "For live accounts, run the included backend and set VITE_API_URL. Add GEMINI_API_KEY on the server to enable receipt scanning, natural-language logging and advice."
                : "Your data is private to your account. Manage your password and signed-in sessions below."
            }
          />
          <p>Currency: Indian Rupee (INR)</p>
          {!DEMO && <AccountSecurity />}
        </div>
      </Modal>
    </div>
  );
}
