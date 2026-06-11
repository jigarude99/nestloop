"use client";

import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  CreditCard,
  Database,
  Droplets,
  HandCoins,
  Home,
  LucideIcon,
  Plus,
  ReceiptText,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Upload,
  Users,
  WalletCards,
  WashingMachine,
  X
} from "lucide-react";
import { CSSProperties, FormEvent, useEffect, useMemo, useState } from "react";
import { hasSupabaseConfig } from "../lib/supabase";

type View = "home" | "expenses" | "tasks" | "calendar" | "people";
type SplitMode = "equal" | "custom";
type PaymentStatus = "pending" | "sent" | "confirmed" | "rejected";
type PaymentMethod = "transfer" | "cash" | "other";

type Person = {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  role: "admin" | "member";
  color: string;
  tint: string;
};

type ExpenseShare = {
  personId: string;
  amount: number;
  status: PaymentStatus;
  paymentMethod?: PaymentMethod;
  proofName?: string;
  sentAt?: string;
  confirmedAt?: string;
};

type Expense = {
  id: string;
  title: string;
  merchant: string;
  category: string;
  amount: number;
  paidBy: string;
  purchasedAt: string;
  createdAt: string;
  note: string;
  receiptName?: string;
  shares: ExpenseShare[];
};

type RotationEvent = {
  personId: string;
  completedAt: string;
  note: string;
};

type Rotation = {
  id: string;
  title: string;
  cadence: string;
  icon: "water" | "trash" | "plants";
  queue: string[];
  currentIndex: number;
  history: RotationEvent[];
};

type ScheduleSlot = {
  id: string;
  day: number;
  personId: string;
  start: string;
  end: string;
  label: string;
};

type NavItem = {
  view: View;
  label: string;
  icon: LucideIcon;
};

const PEOPLE: Person[] = [
  {
    id: "you",
    name: "You",
    shortName: "You",
    initials: "YO",
    role: "admin",
    color: "#0f9f7a",
    tint: "#dff8ef"
  },
  {
    id: "mom",
    name: "Mom",
    shortName: "Mom",
    initials: "MO",
    role: "member",
    color: "#f26d5b",
    tint: "#ffe7e1"
  },
  {
    id: "adriana",
    name: "Adriana",
    shortName: "Adri",
    initials: "AD",
    role: "member",
    color: "#4a90e2",
    tint: "#e4f0ff"
  },
  {
    id: "isabela",
    name: "Isabela",
    shortName: "Isa",
    initials: "IS",
    role: "member",
    color: "#f6c64f",
    tint: "#fff4cf"
  },
  {
    id: "sister",
    name: "Sister",
    shortName: "Sis",
    initials: "SI",
    role: "member",
    color: "#8f79ff",
    tint: "#eeeaff"
  }
];

const NAV_ITEMS: NavItem[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "expenses", label: "Bills", icon: ReceiptText },
  { view: "tasks", label: "Turns", icon: RotateCw },
  { view: "calendar", label: "Laundry", icon: CalendarDays },
  { view: "people", label: "People", icon: Users }
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const CATEGORIES = ["Groceries", "Water", "House", "Cleaning", "Other"];

const DEMO_EXPENSES: Expense[] = [
  {
    id: "exp-walmart",
    title: "Walmart groceries",
    merchant: "Walmart",
    category: "Groceries",
    amount: 92.4,
    paidBy: "you",
    purchasedAt: "2026-06-09",
    createdAt: "2026-06-09T20:20:00.000Z",
    note: "Food and shared kitchen basics.",
    receiptName: "walmart-receipt.jpg",
    shares: [
      { personId: "you", amount: 18.48, status: "confirmed", confirmedAt: "2026-06-09T20:20:00.000Z" },
      { personId: "mom", amount: 18.48, status: "sent", paymentMethod: "cash", sentAt: "2026-06-10T18:00:00.000Z" },
      { personId: "adriana", amount: 18.48, status: "pending" },
      { personId: "isabela", amount: 18.48, status: "confirmed", paymentMethod: "transfer", proofName: "zelle.png" },
      { personId: "sister", amount: 18.48, status: "pending" }
    ]
  },
  {
    id: "exp-water",
    title: "Water gallons",
    merchant: "Water shop",
    category: "Water",
    amount: 28,
    paidBy: "adriana",
    purchasedAt: "2026-06-08",
    createdAt: "2026-06-08T16:10:00.000Z",
    note: "Two bottles for the week.",
    receiptName: "water-ticket.jpg",
    shares: [
      { personId: "you", amount: 7, status: "pending" },
      { personId: "mom", amount: 7, status: "confirmed", paymentMethod: "cash" },
      { personId: "adriana", amount: 7, status: "confirmed" },
      { personId: "isabela", amount: 7, status: "pending" }
    ]
  },
  {
    id: "exp-cleaning",
    title: "Laundry detergent",
    merchant: "Target",
    category: "Cleaning",
    amount: 36.75,
    paidBy: "mom",
    purchasedAt: "2026-06-07",
    createdAt: "2026-06-07T14:00:00.000Z",
    note: "Detergent and softener.",
    shares: [
      { personId: "you", amount: 12.25, status: "confirmed", paymentMethod: "transfer", proofName: "cashapp.png" },
      { personId: "mom", amount: 12.25, status: "confirmed" },
      { personId: "sister", amount: 12.25, status: "rejected", paymentMethod: "transfer", proofName: "wrong-shot.png" }
    ]
  }
];

const DEMO_ROTATIONS: Rotation[] = [
  {
    id: "water-run",
    title: "Buy drinking water",
    cadence: "When bottles run low",
    icon: "water",
    queue: ["you", "mom", "adriana", "isabela", "sister"],
    currentIndex: 2,
    history: [
      { personId: "mom", completedAt: "2026-06-03T18:00:00.000Z", note: "Bought 2 bottles" },
      { personId: "you", completedAt: "2026-05-27T19:00:00.000Z", note: "Bought 2 bottles" }
    ]
  },
  {
    id: "trash",
    title: "Take out trash",
    cadence: "Every Sunday night",
    icon: "trash",
    queue: ["sister", "you", "adriana", "mom"],
    currentIndex: 0,
    history: [{ personId: "isabela", completedAt: "2026-06-02T21:00:00.000Z", note: "Done" }]
  },
  {
    id: "plants",
    title: "Water balcony plants",
    cadence: "Twice a week",
    icon: "plants",
    queue: ["isabela", "mom", "you"],
    currentIndex: 0,
    history: [{ personId: "mom", completedAt: "2026-06-09T08:00:00.000Z", note: "Morning" }]
  }
];

const DEMO_SLOTS: ScheduleSlot[] = [
  { id: "slot-mom-mon", day: 0, personId: "mom", start: "6:00 PM", end: "8:00 PM", label: "Laundry" },
  { id: "slot-you-tue", day: 1, personId: "you", start: "7:00 PM", end: "9:00 PM", label: "Laundry" },
  { id: "slot-adriana-wed", day: 2, personId: "adriana", start: "6:30 PM", end: "8:30 PM", label: "Laundry" },
  { id: "slot-isabela-fri", day: 4, personId: "isabela", start: "5:00 PM", end: "7:00 PM", label: "Laundry" },
  { id: "slot-sister-sat", day: 5, personId: "sister", start: "10:00 AM", end: "12:00 PM", label: "Laundry" }
];

function uid(prefix: string) {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${value}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function relativeDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function cents(value: number) {
  return Math.round(value * 100);
}

function fromCents(value: number) {
  return value / 100;
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function splitEvenly(total: number, count: number) {
  const totalCents = cents(total);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;

  return Array.from({ length: count }, (_, index) =>
    fromCents(base + (index < remainder ? 1 : 0))
  );
}

function getPerson(id: string) {
  return PEOPLE.find((person) => person.id === id) ?? PEOPLE[0];
}

function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      if (stored) {
        setValue(JSON.parse(stored) as T);
      }
    } catch {
      setValue(initialValue);
    } finally {
      setReady(true);
    }
  }, [initialValue, key]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, ready, value]);

  return [value, setValue] as const;
}

function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      className={`avatar avatar-${size}`}
      style={{ "--avatar-color": person.color, "--avatar-tint": person.tint } as CSSProperties}
      aria-label={person.name}
    >
      {person.initials}
    </span>
  );
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const copy: Record<PaymentStatus, string> = {
    pending: "Pending",
    sent: "Needs OK",
    confirmed: "Done",
    rejected: "Fix"
  };

  return <span className={`status status-${status}`}>{copy[status]}</span>;
}

function IconBubble({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span className={`icon-bubble tone-${tone}`}>
      <Icon size={20} strokeWidth={2.4} />
    </span>
  );
}

function rotationIcon(icon: Rotation["icon"]) {
  if (icon === "water") return Droplets;
  if (icon === "trash") return RotateCcw;
  return Sparkles;
}

function AppNav({
  activeView,
  setActiveView
}: {
  activeView: View;
  setActiveView: (view: View) => void;
}) {
  return (
    <nav className="app-nav" aria-label="Main navigation">
      <div className="brand-lockup">
        <span className="brand-mark">
          <RotateCw size={20} />
        </span>
        <div>
          <strong>NestLoop</strong>
          <span>Home rhythm</span>
        </div>
      </div>
      <div className="nav-items">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.view;
          return (
            <button
              className={`nav-button ${active ? "active" : ""}`}
              key={item.view}
              onClick={() => setActiveView(item.view)}
              type="button"
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function TopBar({
  currentUser,
  setCurrentUserId,
  pendingCount
}: {
  currentUser: Person;
  setCurrentUserId: (id: string) => void;
  pendingCount: number;
}) {
  return (
    <header className="top-bar">
      <div className="mobile-brand">
        <span className="brand-mark">
          <RotateCw size={18} />
        </span>
        <strong>NestLoop</strong>
      </div>
      <div className="user-switcher" aria-label="Current person">
        {PEOPLE.map((person) => (
          <button
            className={`person-chip ${person.id === currentUser.id ? "active" : ""}`}
            key={person.id}
            onClick={() => setCurrentUserId(person.id)}
            type="button"
          >
            <Avatar person={person} size="sm" />
            <span>{person.shortName}</span>
          </button>
        ))}
      </div>
      <div className="top-actions">
        <span className={`sync-pill ${hasSupabaseConfig ? "live" : ""}`}>
          <Database size={15} />
          {hasSupabaseConfig ? "Cloud ready" : "Demo data"}
        </span>
        <span className="notification-pill" aria-label={`${pendingCount} open items`}>
          {pendingCount}
        </span>
      </div>
    </header>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone,
  helper
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  tone: string;
  helper: string;
}) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <IconBubble icon={Icon} tone={tone} />
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
      <small>{helper}</small>
    </article>
  );
}

function HomeView({
  currentUser,
  expenses,
  rotations,
  setActiveView,
  setActiveExpenseId
}: {
  currentUser: Person;
  expenses: Expense[];
  rotations: Rotation[];
  setActiveView: (view: View) => void;
  setActiveExpenseId: (id: string) => void;
}) {
  const myOpenShares = expenses.flatMap((expense) =>
    expense.shares
      .filter(
        (share) =>
          share.personId === currentUser.id &&
          expense.paidBy !== currentUser.id &&
          share.status !== "confirmed"
      )
      .map((share) => ({ expense, share }))
  );

  const needsConfirmation = expenses.flatMap((expense) =>
    expense.paidBy === currentUser.id
      ? expense.shares
          .filter((share) => share.status === "sent")
          .map((share) => ({ expense, share }))
      : []
  );

  const amountOwed = myOpenShares.reduce((sum, item) => sum + item.share.amount, 0);
  const amountIncoming = expenses
    .filter((expense) => expense.paidBy === currentUser.id)
    .flatMap((expense) => expense.shares)
    .filter((share) => share.personId !== currentUser.id && share.status !== "confirmed")
    .reduce((sum, share) => sum + share.amount, 0);

  const currentTurns = rotations
    .filter((rotation) => rotation.queue[rotation.currentIndex] === currentUser.id)
    .slice(0, 2);

  return (
    <section className="view-stack">
      <div className="hero-panel">
        <div>
          <p className="eyebrow">Today for {currentUser.name}</p>
          <h1>Home feels lighter when everyone knows their part.</h1>
        </div>
        <button className="primary-action" onClick={() => setActiveView("expenses")} type="button">
          <ReceiptText size={19} />
          Add bill
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          helper={`${myOpenShares.length} open item${myOpenShares.length === 1 ? "" : "s"}`}
          icon={WalletCards}
          label="You owe"
          tone="coral"
          value={money(amountOwed)}
        />
        <StatCard
          helper="Still waiting"
          icon={HandCoins}
          label="Owed to you"
          tone="mint"
          value={money(amountIncoming)}
        />
        <StatCard
          helper={currentTurns.length ? "You are up" : "Nothing urgent"}
          icon={RotateCw}
          label="Turns"
          tone="sun"
          value={currentTurns.length ? String(currentTurns.length) : "0"}
        />
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Next actions</p>
          <h2>Clear and close</h2>
        </div>
      </div>

      <div className="action-list">
        {myOpenShares.slice(0, 3).map(({ expense, share }) => (
          <button
            className="action-row"
            key={`${expense.id}-${share.personId}`}
            onClick={() => setActiveExpenseId(expense.id)}
            type="button"
          >
            <IconBubble icon={CreditCard} tone="coral" />
            <span>
              <strong>Pay {money(share.amount)}</strong>
              <small>{expense.title} to {getPerson(expense.paidBy).name}</small>
            </span>
            <ChevronRight size={19} />
          </button>
        ))}

        {needsConfirmation.slice(0, 2).map(({ expense, share }) => (
          <button
            className="action-row"
            key={`${expense.id}-${share.personId}-confirm`}
            onClick={() => setActiveExpenseId(expense.id)}
            type="button"
          >
            <IconBubble icon={ShieldCheck} tone="mint" />
            <span>
              <strong>Confirm {getPerson(share.personId).name}</strong>
              <small>{expense.title} cash payment</small>
            </span>
            <ChevronRight size={19} />
          </button>
        ))}

        {currentTurns.map((rotation) => {
          const Icon = rotationIcon(rotation.icon);
          return (
            <button
              className="action-row"
              key={rotation.id}
              onClick={() => setActiveView("tasks")}
              type="button"
            >
              <IconBubble icon={Icon} tone="sky" />
              <span>
                <strong>{rotation.title}</strong>
                <small>{rotation.cadence}</small>
              </span>
              <ChevronRight size={19} />
            </button>
          );
        })}

        {!myOpenShares.length && !needsConfirmation.length && !currentTurns.length ? (
          <div className="empty-state">
            <CheckCircle2 size={28} />
            <strong>All clear</strong>
            <span>No open payments or turns right now.</span>
          </div>
        ) : null}
      </div>

      <div className="section-heading compact">
        <div>
          <p className="eyebrow">House board</p>
          <h2>At a glance</h2>
        </div>
      </div>

      <div className="board-grid">
        {rotations.slice(0, 3).map((rotation) => {
          const person = getPerson(rotation.queue[rotation.currentIndex]);
          const Icon = rotationIcon(rotation.icon);
          return (
            <article className="board-card" key={rotation.id}>
              <IconBubble icon={Icon} tone="sky" />
              <div>
                <small>{rotation.title}</small>
                <strong>{person.name}</strong>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function ExpenseCard({
  expense,
  onOpen
}: {
  expense: Expense;
  onOpen: (id: string) => void;
}) {
  const paidBy = getPerson(expense.paidBy);
  const confirmed = expense.shares.filter((share) => share.status === "confirmed").length;
  const progress = Math.round((confirmed / expense.shares.length) * 100);

  return (
    <button className="expense-card" onClick={() => onOpen(expense.id)} type="button">
      <div className="expense-main">
        <div className="receipt-thumb">
          <ReceiptText size={23} />
        </div>
        <div>
          <strong>{expense.title}</strong>
          <span>
            {expense.merchant} • {shortDate(expense.purchasedAt)}
          </span>
        </div>
      </div>
      <div className="expense-side">
        <strong>{money(expense.amount)}</strong>
        <span>paid by {paidBy.shortName}</span>
      </div>
      <div className="progress-line" aria-label={`${progress}% confirmed`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="expense-footer">
        <div className="mini-avatars">
          {expense.shares.map((share) => (
            <Avatar key={share.personId} person={getPerson(share.personId)} size="sm" />
          ))}
        </div>
        <span>{confirmed}/{expense.shares.length} done</span>
      </div>
    </button>
  );
}

function ExpenseForm({
  currentUser,
  onClose,
  onCreate
}: {
  currentUser: Person;
  onClose: () => void;
  onCreate: (expense: Expense) => void;
}) {
  const [title, setTitle] = useState("Shared groceries");
  const [merchant, setMerchant] = useState("Walmart");
  const [category, setCategory] = useState("Groceries");
  const [amount, setAmount] = useState("80.00");
  const [paidBy, setPaidBy] = useState(currentUser.id);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptName, setReceiptName] = useState("");
  const [note, setNote] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [selected, setSelected] = useState<Record<string, boolean>>(
    Object.fromEntries(PEOPLE.map((person) => [person.id, true]))
  );
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(
    Object.fromEntries(PEOPLE.map((person) => [person.id, ""]))
  );

  const selectedPeople = PEOPLE.filter((person) => selected[person.id]);
  const total = parseMoney(amount);
  const evenAmounts = selectedPeople.length ? splitEvenly(total, selectedPeople.length) : [];
  const customTotal = selectedPeople.reduce(
    (sum, person) => sum + parseMoney(customAmounts[person.id] || "0"),
    0
  );
  const customDifference = total - customTotal;
  const validCustom = splitMode === "equal" || Math.abs(customDifference) < 0.01;
  const canSubmit = title.trim() && merchant.trim() && total > 0 && selectedPeople.length > 0 && validCustom;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    const shares = selectedPeople.map((person, index) => {
      const shareAmount =
        splitMode === "equal" ? evenAmounts[index] : parseMoney(customAmounts[person.id] || "0");
      return {
        personId: person.id,
        amount: shareAmount,
        status: person.id === paidBy ? ("confirmed" as PaymentStatus) : ("pending" as PaymentStatus),
        confirmedAt: person.id === paidBy ? new Date().toISOString() : undefined
      };
    });

    onCreate({
      id: uid("expense"),
      title: title.trim(),
      merchant: merchant.trim(),
      category,
      amount: total,
      paidBy,
      purchasedAt: date,
      createdAt: new Date().toISOString(),
      note: note.trim(),
      receiptName: receiptName || undefined,
      shares
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet expense-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">New bill</p>
            <h2>Add a shared expense</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="form-grid two">
          <label>
            <span>Title</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>Store</span>
            <input value={merchant} onChange={(event) => setMerchant(event.target.value)} />
          </label>
          <label>
            <span>Total</span>
            <input
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            <span>Date</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>Category</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Paid by</span>
            <select value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>
              {PEOPLE.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="file-pick">
          <Camera size={19} />
          <span>{receiptName || "Attach receipt photo"}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? "")}
          />
        </label>

        <label>
          <span>Note</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional"
            rows={3}
          />
        </label>

        <div className="split-toolbar">
          <span>Split</span>
          <div className="segmented">
            <button
              className={splitMode === "equal" ? "active" : ""}
              onClick={() => setSplitMode("equal")}
              type="button"
            >
              Equal
            </button>
            <button
              className={splitMode === "custom" ? "active" : ""}
              onClick={() => setSplitMode("custom")}
              type="button"
            >
              Custom
            </button>
          </div>
        </div>

        <div className="people-picker">
          {PEOPLE.map((person, index) => {
            const isSelected = selected[person.id];
            return (
              <div className={`share-row ${isSelected ? "selected" : ""}`} key={person.id}>
                <button
                  className="check-person"
                  onClick={() =>
                    setSelected((current) => ({
                      ...current,
                      [person.id]: !current[person.id]
                    }))
                  }
                  type="button"
                >
                  <Avatar person={person} size="sm" />
                  <span>{person.name}</span>
                  {isSelected ? <Check size={18} /> : null}
                </button>
                {splitMode === "custom" ? (
                  <input
                    aria-label={`${person.name} amount`}
                    disabled={!isSelected}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={customAmounts[person.id] ?? ""}
                    onChange={(event) =>
                      setCustomAmounts((current) => ({
                        ...current,
                        [person.id]: event.target.value
                      }))
                    }
                  />
                ) : (
                  <strong>{isSelected ? money(evenAmounts[index] ?? 0) : "$0.00"}</strong>
                )}
              </div>
            );
          })}
        </div>

        {splitMode === "custom" ? (
          <div className={`difference-note ${validCustom ? "ok" : ""}`}>
            {validCustom ? "Custom split matches total." : `${money(Math.abs(customDifference))} left to match.`}
          </div>
        ) : null}

        <button className="primary-action full" disabled={!canSubmit} type="submit">
          <Plus size={19} />
          Create bill
        </button>
      </form>
    </div>
  );
}

function ExpenseDetail({
  expense,
  currentUser,
  onClose,
  onMarkPaid,
  onConfirm,
  onReject
}: {
  expense: Expense;
  currentUser: Person;
  onClose: () => void;
  onMarkPaid: (expenseId: string, personId: string, method: PaymentMethod, proofName?: string) => void;
  onConfirm: (expenseId: string, personId: string) => void;
  onReject: (expenseId: string, personId: string) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [proofName, setProofName] = useState("");
  const payer = getPerson(expense.paidBy);
  const currentShare = expense.shares.find((share) => share.personId === currentUser.id);
  const needsProof = method !== "cash";
  const canSendPayment = currentShare && currentShare.status !== "confirmed" && (!needsProof || proofName);

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet detail-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">{expense.category}</p>
            <h2>{expense.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="detail-hero">
          <div className="receipt-preview">
            <ReceiptText size={28} />
            <span>{expense.receiptName ?? "No photo yet"}</span>
          </div>
          <div className="detail-money">
            <span>Total</span>
            <strong>{money(expense.amount)}</strong>
            <small>
              {expense.merchant} • {shortDate(expense.purchasedAt)}
            </small>
          </div>
        </div>

        <div className="payer-line">
          <Avatar person={payer} size="sm" />
          <span>Paid by {payer.name}</span>
        </div>

        <div className="share-list">
          {expense.shares.map((share) => {
            const person = getPerson(share.personId);
            const isReceiver = expense.paidBy === currentUser.id;
            const canReview = isReceiver && share.personId !== currentUser.id && share.status === "sent";

            return (
              <div className="payment-row" key={share.personId}>
                <div className="payment-person">
                  <Avatar person={person} size="sm" />
                  <span>
                    <strong>{person.name}</strong>
                    <small>{share.proofName ?? share.paymentMethod ?? "No proof yet"}</small>
                  </span>
                </div>
                <strong>{money(share.amount)}</strong>
                <StatusBadge status={share.status} />
                {canReview ? (
                  <div className="row-actions">
                    <button
                      className="tiny-button good"
                      onClick={() => onConfirm(expense.id, share.personId)}
                      type="button"
                    >
                      OK
                    </button>
                    <button
                      className="tiny-button"
                      onClick={() => onReject(expense.id, share.personId)}
                      type="button"
                    >
                      Fix
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {currentShare && currentShare.status !== "confirmed" && expense.paidBy !== currentUser.id ? (
          <div className="payment-box">
            <div className="split-toolbar">
              <span>Mark payment</span>
              <div className="segmented">
                <button
                  className={method === "transfer" ? "active" : ""}
                  onClick={() => setMethod("transfer")}
                  type="button"
                >
                  Transfer
                </button>
                <button
                  className={method === "cash" ? "active" : ""}
                  onClick={() => setMethod("cash")}
                  type="button"
                >
                  Cash
                </button>
              </div>
            </div>
            {method !== "cash" ? (
              <label className="file-pick">
                <Upload size={18} />
                <span>{proofName || "Upload screenshot"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setProofName(event.target.files?.[0]?.name ?? "")}
                />
              </label>
            ) : (
              <div className="cash-note">
                <HandCoins size={19} />
                <span>Cash waits for {payer.shortName} to confirm.</span>
              </div>
            )}
            <button
              className="primary-action full"
              disabled={!canSendPayment}
              onClick={() => onMarkPaid(expense.id, currentUser.id, method, proofName)}
              type="button"
            >
              <BadgeCheck size={19} />
              Mark {money(currentShare.amount)} paid
            </button>
          </div>
        ) : null}

        <div className="timeline-note">
          <Clock3 size={17} />
          <span>Added {relativeDate(expense.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function ExpensesView({
  currentUser,
  expenses,
  onCreate,
  setActiveExpenseId
}: {
  currentUser: Person;
  expenses: Expense[];
  onCreate: (expense: Expense) => void;
  setActiveExpenseId: (id: string) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Shared bills</p>
          <h1>Every receipt has a home.</h1>
        </div>
        <button className="primary-action" onClick={() => setShowForm(true)} type="button">
          <Plus size={19} />
          Add bill
        </button>
      </div>

      <div className="expense-list">
        {expenses.map((expense) => (
          <ExpenseCard expense={expense} key={expense.id} onOpen={setActiveExpenseId} />
        ))}
      </div>

      {showForm ? (
        <ExpenseForm
          currentUser={currentUser}
          onClose={() => setShowForm(false)}
          onCreate={(expense) => {
            onCreate(expense);
            setShowForm(false);
            setActiveExpenseId(expense.id);
          }}
        />
      ) : null}
    </section>
  );
}

function RotationCard({
  rotation,
  onComplete
}: {
  rotation: Rotation;
  onComplete: (id: string) => void;
}) {
  const Icon = rotationIcon(rotation.icon);
  const currentPerson = getPerson(rotation.queue[rotation.currentIndex]);

  return (
    <article className="rotation-card">
      <div className="rotation-top">
        <IconBubble icon={Icon} tone="sky" />
        <div>
          <strong>{rotation.title}</strong>
          <span>{rotation.cadence}</span>
        </div>
      </div>
      <div className="current-turn">
        <Avatar person={currentPerson} size="lg" />
        <div>
          <span>Up now</span>
          <strong>{currentPerson.name}</strong>
        </div>
      </div>
      <div className="queue-strip">
        {rotation.queue.map((personId, index) => {
          const person = getPerson(personId);
          const active = index === rotation.currentIndex;
          return (
            <span className={active ? "active" : ""} key={`${rotation.id}-${personId}`}>
              <Avatar person={person} size="sm" />
              {person.shortName}
            </span>
          );
        })}
      </div>
      <button className="secondary-action full" onClick={() => onComplete(rotation.id)} type="button">
        <CheckCircle2 size={19} />
        Mark done
      </button>
      <div className="history-list">
        {rotation.history.slice(0, 2).map((event) => (
          <div key={`${event.personId}-${event.completedAt}`}>
            <span>{getPerson(event.personId).shortName}</span>
            <small>{shortDate(event.completedAt.slice(0, 10))}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function TasksView({
  rotations,
  onComplete
}: {
  rotations: Rotation[];
  onComplete: (id: string) => void;
}) {
  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Rotating turns</p>
          <h1>No whiteboard math.</h1>
        </div>
      </div>
      <div className="rotation-grid">
        {rotations.map((rotation) => (
          <RotationCard key={rotation.id} rotation={rotation} onComplete={onComplete} />
        ))}
      </div>
    </section>
  );
}

function ScheduleForm({
  currentUser,
  onClose,
  onCreate
}: {
  currentUser: Person;
  onClose: () => void;
  onCreate: (slot: ScheduleSlot) => void;
}) {
  const [personId, setPersonId] = useState(currentUser.id);
  const [day, setDay] = useState("0");
  const [start, setStart] = useState("6:00 PM");
  const [end, setEnd] = useState("8:00 PM");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreate({
      id: uid("slot"),
      day: Number(day),
      personId,
      start,
      end,
      label: "Laundry"
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet schedule-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Laundry</p>
            <h2>Add a slot</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <label>
          <span>Person</span>
          <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
            {PEOPLE.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Day</span>
          <select value={day} onChange={(event) => setDay(event.target.value)}>
            {DAYS.map((item, index) => (
              <option key={item} value={index}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid two">
          <label>
            <span>Start</span>
            <input value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            <span>End</span>
            <input value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        <button className="primary-action full" type="submit">
          <Plus size={19} />
          Add slot
        </button>
      </form>
    </div>
  );
}

function CalendarView({
  currentUser,
  slots,
  onCreate
}: {
  currentUser: Person;
  slots: ScheduleSlot[];
  onCreate: (slot: ScheduleSlot) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Laundry week</p>
          <h1>Simple slots, fewer surprises.</h1>
        </div>
        <button className="primary-action" onClick={() => setShowForm(true)} type="button">
          <Plus size={19} />
          Add slot
        </button>
      </div>

      <div className="calendar-grid">
        {DAYS.map((day, dayIndex) => {
          const daySlots = slots.filter((slot) => slot.day === dayIndex);
          return (
            <article className="day-card" key={day}>
              <strong>{day}</strong>
              {daySlots.length ? (
                daySlots.map((slot) => {
                  const person = getPerson(slot.personId);
                  return (
                    <div
                      className="slot-pill"
                      key={slot.id}
                      style={{ "--slot-color": person.color, "--slot-tint": person.tint } as CSSProperties}
                    >
                      <Avatar person={person} size="sm" />
                      <span>
                        <strong>{person.shortName}</strong>
                        <small>{slot.start} - {slot.end}</small>
                      </span>
                    </div>
                  );
                })
              ) : (
                <span className="open-slot">Open</span>
              )}
            </article>
          );
        })}
      </div>

      {showForm ? (
        <ScheduleForm
          currentUser={currentUser}
          onClose={() => setShowForm(false)}
          onCreate={(slot) => {
            onCreate(slot);
            setShowForm(false);
          }}
        />
      ) : null}
    </section>
  );
}

function PeopleView({
  expenses,
  rotations,
  resetDemo
}: {
  expenses: Expense[];
  rotations: Rotation[];
  resetDemo: () => void;
}) {
  function personBalance(personId: string) {
    const owes = expenses
      .flatMap((expense) =>
        expense.shares
          .filter(
            (share) =>
              share.personId === personId &&
              expense.paidBy !== personId &&
              share.status !== "confirmed"
          )
          .map((share) => share.amount)
      )
      .reduce((sum, value) => sum + value, 0);

    const incoming = expenses
      .filter((expense) => expense.paidBy === personId)
      .flatMap((expense) => expense.shares)
      .filter((share) => share.personId !== personId && share.status !== "confirmed")
      .reduce((sum, share) => sum + share.amount, 0);

    return incoming - owes;
  }

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Household</p>
          <h1>Everyone has one clear place.</h1>
        </div>
      </div>

      <div className="people-grid">
        {PEOPLE.map((person) => {
          const balance = personBalance(person.id);
          const nextTurn = rotations.find((rotation) => rotation.queue[rotation.currentIndex] === person.id);
          return (
            <article className="person-card" key={person.id}>
              <div className="person-card-top">
                <Avatar person={person} size="lg" />
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.role === "admin" ? "Admin" : "Member"}</span>
                </div>
              </div>
              <div className={`balance-pill ${balance >= 0 ? "positive" : "negative"}`}>
                <CircleDollarSign size={18} />
                <span>{balance >= 0 ? "Gets back" : "Owes"} {money(Math.abs(balance))}</span>
              </div>
              <div className="next-turn-line">
                <RotateCw size={17} />
                <span>{nextTurn ? nextTurn.title : "No turn right now"}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="launch-panel">
        <div>
          <p className="eyebrow">Launch path</p>
          <h2>Ready for the cloud handoff</h2>
        </div>
        <div className="launch-steps">
          <div>
            <Smartphone size={20} />
            <span>Phone-ready PWA</span>
          </div>
          <div>
            <Database size={20} />
            <span>Supabase schema drafted</span>
          </div>
          <div>
            <ShieldCheck size={20} />
            <span>Private household model</span>
          </div>
        </div>
        <button className="secondary-action" onClick={resetDemo} type="button">
          <RotateCcw size={18} />
          Reset demo
        </button>
      </div>
    </section>
  );
}

export function NestLoopApp() {
  const [activeView, setActiveView] = useState<View>("home");
  const [currentUserId, setCurrentUserId] = useStoredState("nestloop-current-user", "you");
  const [expenses, setExpenses] = useStoredState<Expense[]>("nestloop-expenses", DEMO_EXPENSES);
  const [rotations, setRotations] = useStoredState<Rotation[]>("nestloop-rotations", DEMO_ROTATIONS);
  const [slots, setSlots] = useStoredState<ScheduleSlot[]>("nestloop-slots", DEMO_SLOTS);
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null);

  const currentUser = getPerson(currentUserId);
  const activeExpense = expenses.find((expense) => expense.id === activeExpenseId);

  const pendingCount = useMemo(() => {
    const myPending = expenses
      .flatMap((expense) =>
        expense.shares.map((share) => ({
          expense,
          share
        }))
      )
      .filter(
        ({ expense, share }) =>
          share.personId === currentUser.id &&
          expense.paidBy !== currentUser.id &&
          share.status !== "confirmed"
      ).length;

    const confirmations = expenses
      .filter((expense) => expense.paidBy === currentUser.id)
      .flatMap((expense) => expense.shares)
      .filter((share) => share.status === "sent").length;

    const turns = rotations.filter((rotation) => rotation.queue[rotation.currentIndex] === currentUser.id).length;

    return myPending + confirmations + turns;
  }, [currentUser.id, expenses, rotations]);

  function createExpense(expense: Expense) {
    setExpenses((current) => [expense, ...current]);
  }

  function markPaid(expenseId: string, personId: string, method: PaymentMethod, proofName?: string) {
    setExpenses((current) =>
      current.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              shares: expense.shares.map((share) =>
                share.personId === personId
                  ? {
                      ...share,
                      status: method === "cash" ? "sent" : "confirmed",
                      paymentMethod: method,
                      proofName,
                      sentAt: new Date().toISOString(),
                      confirmedAt: method === "cash" ? undefined : new Date().toISOString()
                    }
                  : share
              )
            }
          : expense
      )
    );
  }

  function confirmPayment(expenseId: string, personId: string) {
    setExpenses((current) =>
      current.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              shares: expense.shares.map((share) =>
                share.personId === personId
                  ? { ...share, status: "confirmed", confirmedAt: new Date().toISOString() }
                  : share
              )
            }
          : expense
      )
    );
  }

  function rejectPayment(expenseId: string, personId: string) {
    setExpenses((current) =>
      current.map((expense) =>
        expense.id === expenseId
          ? {
              ...expense,
              shares: expense.shares.map((share) =>
                share.personId === personId ? { ...share, status: "rejected" } : share
              )
            }
          : expense
      )
    );
  }

  function completeRotation(rotationId: string) {
    setRotations((current) =>
      current.map((rotation) => {
        if (rotation.id !== rotationId) return rotation;

        const currentPersonId = rotation.queue[rotation.currentIndex];
        return {
          ...rotation,
          currentIndex: (rotation.currentIndex + 1) % rotation.queue.length,
          history: [
            {
              personId: currentPersonId,
              completedAt: new Date().toISOString(),
              note: "Done"
            },
            ...rotation.history
          ]
        };
      })
    );
  }

  function resetDemo() {
    setExpenses(DEMO_EXPENSES);
    setRotations(DEMO_ROTATIONS);
    setSlots(DEMO_SLOTS);
    setCurrentUserId("you");
    setActiveView("home");
  }

  return (
    <main className="app-shell">
      <AppNav activeView={activeView} setActiveView={setActiveView} />
      <div className="app-main">
        <TopBar currentUser={currentUser} pendingCount={pendingCount} setCurrentUserId={setCurrentUserId} />

        {activeView === "home" ? (
          <HomeView
            currentUser={currentUser}
            expenses={expenses}
            rotations={rotations}
            setActiveExpenseId={setActiveExpenseId}
            setActiveView={setActiveView}
          />
        ) : null}

        {activeView === "expenses" ? (
          <ExpensesView
            currentUser={currentUser}
            expenses={expenses}
            onCreate={createExpense}
            setActiveExpenseId={setActiveExpenseId}
          />
        ) : null}

        {activeView === "tasks" ? <TasksView rotations={rotations} onComplete={completeRotation} /> : null}

        {activeView === "calendar" ? (
          <CalendarView
            currentUser={currentUser}
            slots={slots}
            onCreate={(slot) => setSlots((current) => [...current, slot])}
          />
        ) : null}

        {activeView === "people" ? (
          <PeopleView expenses={expenses} resetDemo={resetDemo} rotations={rotations} />
        ) : null}
      </div>

      {activeExpense ? (
        <ExpenseDetail
          currentUser={currentUser}
          expense={activeExpense}
          onClose={() => setActiveExpenseId(null)}
          onConfirm={confirmPayment}
          onMarkPaid={markPaid}
          onReject={rejectPayment}
        />
      ) : null}
    </main>
  );
}
