"use client";

import {
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
  KeyRound,
  LogOut,
  LucideIcon,
  Plus,
  ReceiptText,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Upload,
  Users,
  WalletCards,
  X
} from "lucide-react";
import {
  createContext,
  CSSProperties,
  FormEvent,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { hasSupabaseConfig } from "../lib/supabase";
import { Household, Person } from "../lib/household";

type View = "home" | "expenses" | "tasks" | "calendar" | "people";
type SplitMode = "equal" | "custom";
type PaymentStatus = "pending" | "sent" | "confirmed" | "rejected";
type PaymentMethod = "transfer" | "cash" | "other";

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

const NAV_ITEMS: NavItem[] = [
  { view: "home", label: "Inicio", icon: Home },
  { view: "expenses", label: "Gastos", icon: ReceiptText },
  { view: "tasks", label: "Turnos", icon: RotateCw },
  { view: "calendar", label: "Lavadora", icon: CalendarDays },
  { view: "people", label: "Personas", icon: Users }
];

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CATEGORIES = ["Comida", "Agua", "Casa", "Limpieza", "Otro"];

// ---------------------------------------------------------------------------
// Contexto de datos de la casa (personas reales + usuario actual)
// ---------------------------------------------------------------------------
type AppData = {
  people: Person[];
  getPerson: (id: string) => Person;
  currentUserId: string;
};

const AppDataContext = createContext<AppData | null>(null);

function useApp(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de NestLoopApp");
  return ctx;
}

const PLACEHOLDER: Person = {
  id: "desconocido",
  name: "Sin nombre",
  shortName: "—",
  initials: "?",
  role: "member",
  color: "#9aa6a0",
  tint: "#9aa6a026"
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function uid(prefix: string) {
  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return `${prefix}-${value}`;
}

function money(value: number) {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric"
  }).format(new Date(`${value}T12:00:00`));
}

function relativeDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
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

function useStoredState<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key);
      setValue(stored ? (JSON.parse(stored) as T) : initialValue);
    } catch {
      setValue(initialValue);
    } finally {
      setReady(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, ready, value]);

  return [value, setValue] as const;
}

// ---------------------------------------------------------------------------
// Piezas visuales reutilizables
// ---------------------------------------------------------------------------
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
    pending: "Pendiente",
    sent: "Por aprobar",
    confirmed: "Listo",
    rejected: "Revisar"
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
    <nav className="app-nav" aria-label="Navegación principal">
      <div className="brand-lockup">
        <span className="brand-mark">
          <RotateCw size={20} />
        </span>
        <div>
          <strong>NestLoop</strong>
          <span>Ritmo del hogar</span>
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
  household,
  pendingCount,
  onSignOut
}: {
  currentUser: Person;
  household: Household;
  pendingCount: number;
  onSignOut: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    if (!household.invite_code) return;
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <header className="top-bar">
      <div className="mobile-brand">
        <span className="brand-mark">
          <RotateCw size={18} />
        </span>
        <strong>NestLoop</strong>
      </div>
      <div className="top-greeting">
        <p className="eyebrow">{household.name}</p>
        <strong>Hola, {currentUser.name}</strong>
      </div>
      <div className="top-actions">
        <span className={`sync-pill ${hasSupabaseConfig ? "live" : ""}`}>
          <Database size={15} />
          {hasSupabaseConfig ? "En la nube" : "Local"}
        </span>
        {household.invite_code ? (
          <button className="code-pill" onClick={copyCode} type="button" title="Código para invitar a tu familia">
            <KeyRound size={14} />
            {copied ? "¡Copiado!" : household.invite_code}
          </button>
        ) : null}
        <span className="person-chip active">
          <Avatar person={currentUser} size="sm" />
          <span>{currentUser.shortName}</span>
        </span>
        <span className="notification-pill" aria-label={`${pendingCount} pendientes`}>
          {pendingCount}
        </span>
        <button className="icon-button" onClick={onSignOut} type="button" aria-label="Cerrar sesión">
          <LogOut size={18} />
        </button>
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
  const { getPerson } = useApp();

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
          <p className="eyebrow">Hoy para {currentUser.name}</p>
          <h1>El hogar se siente mejor cuando cada quien sabe qué le toca.</h1>
        </div>
        <button className="primary-action" onClick={() => setActiveView("expenses")} type="button">
          <ReceiptText size={19} />
          Agregar gasto
        </button>
      </div>

      <div className="stats-grid">
        <StatCard
          helper={`${myOpenShares.length} ${myOpenShares.length === 1 ? "pendiente" : "pendientes"}`}
          icon={WalletCards}
          label="Debes"
          tone="coral"
          value={money(amountOwed)}
        />
        <StatCard
          helper="A la espera"
          icon={HandCoins}
          label="Te deben"
          tone="mint"
          value={money(amountIncoming)}
        />
        <StatCard
          helper={currentTurns.length ? "Te toca" : "Nada urgente"}
          icon={RotateCw}
          label="Turnos"
          tone="sun"
          value={currentTurns.length ? String(currentTurns.length) : "0"}
        />
      </div>

      <div className="section-heading">
        <div>
          <p className="eyebrow">Próximas acciones</p>
          <h2>Resolver y cerrar</h2>
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
              <strong>Pagar {money(share.amount)}</strong>
              <small>{expense.title} a {getPerson(expense.paidBy).name}</small>
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
              <strong>Confirmar a {getPerson(share.personId).name}</strong>
              <small>{expense.title} · pago en efectivo</small>
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
            <strong>Todo al día</strong>
            <span>No hay pagos ni turnos pendientes ahora mismo.</span>
          </div>
        ) : null}
      </div>

      {rotations.length ? (
        <>
          <div className="section-heading compact">
            <div>
              <p className="eyebrow">Tablero de la casa</p>
              <h2>De un vistazo</h2>
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
        </>
      ) : null}
    </section>
  );
}

function ExpenseCard({ expense, onOpen }: { expense: Expense; onOpen: (id: string) => void }) {
  const { getPerson } = useApp();
  const paidBy = getPerson(expense.paidBy);
  const confirmed = expense.shares.filter((share) => share.status === "confirmed").length;
  const progress = expense.shares.length
    ? Math.round((confirmed / expense.shares.length) * 100)
    : 0;

  return (
    <button className="expense-card" onClick={() => onOpen(expense.id)} type="button">
      <div className="expense-main">
        <div className="receipt-thumb">
          <ReceiptText size={23} />
        </div>
        <div>
          <strong>{expense.title}</strong>
          <span>
            {expense.merchant || "Sin tienda"} • {shortDate(expense.purchasedAt)}
          </span>
        </div>
      </div>
      <div className="expense-side">
        <strong>{money(expense.amount)}</strong>
        <span>pagó {paidBy.shortName}</span>
      </div>
      <div className="progress-line" aria-label={`${progress}% confirmado`}>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="expense-footer">
        <div className="mini-avatars">
          {expense.shares.map((share) => (
            <Avatar key={share.personId} person={getPerson(share.personId)} size="sm" />
          ))}
        </div>
        <span>{confirmed}/{expense.shares.length} listos</span>
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
  const { people } = useApp();
  const [title, setTitle] = useState("Compra compartida");
  const [merchant, setMerchant] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState(currentUser.id);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [receiptName, setReceiptName] = useState("");
  const [note, setNote] = useState("");
  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((person) => [person.id, true]))
  );
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(people.map((person) => [person.id, ""]))
  );

  const selectedPeople = people.filter((person) => selected[person.id]);
  const total = parseMoney(amount);
  const evenAmounts = selectedPeople.length ? splitEvenly(total, selectedPeople.length) : [];
  const customTotal = selectedPeople.reduce(
    (sum, person) => sum + parseMoney(customAmounts[person.id] || "0"),
    0
  );
  const customDifference = total - customTotal;
  const validCustom = splitMode === "equal" || Math.abs(customDifference) < 0.01;
  const canSubmit =
    title.trim() && total > 0 && selectedPeople.length > 0 && validCustom;

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
            <p className="eyebrow">Nuevo gasto</p>
            <h2>Agrega un gasto compartido</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="form-grid two">
          <label>
            <span>Título</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>Tienda</span>
            <input
              placeholder="Ej: Walmart"
              value={merchant}
              onChange={(event) => setMerchant(event.target.value)}
            />
          </label>
          <label>
            <span>Total</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            <span>Fecha</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <label>
            <span>Categoría</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              {CATEGORIES.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Pagó</span>
            <select value={paidBy} onChange={(event) => setPaidBy(event.target.value)}>
              {people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="file-pick">
          <Camera size={19} />
          <span>{receiptName || "Adjuntar foto de la factura"}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setReceiptName(event.target.files?.[0]?.name ?? "")}
          />
        </label>

        <label>
          <span>Nota</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Opcional"
            rows={3}
          />
        </label>

        <div className="split-toolbar">
          <span>Dividir</span>
          <div className="segmented">
            <button
              className={splitMode === "equal" ? "active" : ""}
              onClick={() => setSplitMode("equal")}
              type="button"
            >
              Igual
            </button>
            <button
              className={splitMode === "custom" ? "active" : ""}
              onClick={() => setSplitMode("custom")}
              type="button"
            >
              Personalizado
            </button>
          </div>
        </div>

        <div className="people-picker">
          {people.map((person, index) => {
            const isSelected = selected[person.id];
            return (
              <div className={`share-row ${isSelected ? "selected" : ""}`} key={person.id}>
                <button
                  className="check-person"
                  onClick={() =>
                    setSelected((current) => ({ ...current, [person.id]: !current[person.id] }))
                  }
                  type="button"
                >
                  <Avatar person={person} size="sm" />
                  <span>{person.name}</span>
                  {isSelected ? <Check size={18} /> : null}
                </button>
                {splitMode === "custom" ? (
                  <input
                    aria-label={`Monto de ${person.name}`}
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
                  <strong>{isSelected ? money(evenAmounts[selectedPeople.indexOf(person)] ?? 0) : money(0)}</strong>
                )}
              </div>
            );
          })}
        </div>

        {splitMode === "custom" ? (
          <div className={`difference-note ${validCustom ? "ok" : ""}`}>
            {validCustom
              ? "La división personalizada cuadra con el total."
              : `Faltan ${money(Math.abs(customDifference))} por cuadrar.`}
          </div>
        ) : null}

        <button className="primary-action full" disabled={!canSubmit} type="submit">
          <Plus size={19} />
          Crear gasto
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
  const { getPerson } = useApp();
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
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="detail-hero">
          <div className="receipt-preview">
            <ReceiptText size={28} />
            <span>{expense.receiptName ?? "Sin foto"}</span>
          </div>
          <div className="detail-money">
            <span>Total</span>
            <strong>{money(expense.amount)}</strong>
            <small>
              {expense.merchant || "Sin tienda"} • {shortDate(expense.purchasedAt)}
            </small>
          </div>
        </div>

        <div className="payer-line">
          <Avatar person={payer} size="sm" />
          <span>Pagó {payer.name}</span>
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
                    <small>
                      {share.proofName ?? methodLabel(share.paymentMethod) ?? "Sin comprobante"}
                    </small>
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
                      Aceptar
                    </button>
                    <button
                      className="tiny-button"
                      onClick={() => onReject(expense.id, share.personId)}
                      type="button"
                    >
                      Rechazar
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
              <span>Marcar pago</span>
              <div className="segmented">
                <button
                  className={method === "transfer" ? "active" : ""}
                  onClick={() => setMethod("transfer")}
                  type="button"
                >
                  Transferencia
                </button>
                <button
                  className={method === "cash" ? "active" : ""}
                  onClick={() => setMethod("cash")}
                  type="button"
                >
                  Efectivo
                </button>
              </div>
            </div>
            {method !== "cash" ? (
              <label className="file-pick">
                <Upload size={18} />
                <span>{proofName || "Subir captura del pago"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setProofName(event.target.files?.[0]?.name ?? "")}
                />
              </label>
            ) : (
              <div className="cash-note">
                <HandCoins size={19} />
                <span>El efectivo espera que {payer.shortName} lo confirme.</span>
              </div>
            )}
            <button
              className="primary-action full"
              disabled={!canSendPayment}
              onClick={() => onMarkPaid(expense.id, currentUser.id, method, proofName)}
              type="button"
            >
              <BadgeCheck size={19} />
              Marcar {money(currentShare.amount)} pagado
            </button>
          </div>
        ) : null}

        <div className="timeline-note">
          <Clock3 size={17} />
          <span>Agregado {relativeDate(expense.createdAt)}</span>
        </div>
      </div>
    </div>
  );
}

function methodLabel(method?: PaymentMethod) {
  if (method === "transfer") return "Transferencia";
  if (method === "cash") return "Efectivo";
  if (method === "other") return "Otro";
  return undefined;
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
          <p className="eyebrow">Gastos compartidos</p>
          <h1>Cada factura tiene su lugar.</h1>
        </div>
        <button className="primary-action" onClick={() => setShowForm(true)} type="button">
          <Plus size={19} />
          Agregar gasto
        </button>
      </div>

      {expenses.length ? (
        <div className="expense-list">
          {expenses.map((expense) => (
            <ExpenseCard expense={expense} key={expense.id} onOpen={setActiveExpenseId} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ReceiptText size={28} />
          <strong>Aún no hay gastos</strong>
          <span>Crea el primero con el botón “Agregar gasto”.</span>
        </div>
      )}

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
  const { getPerson } = useApp();
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
          <span>Le toca</span>
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
        Marcar hecho
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

function RotationForm({
  onClose,
  onCreate
}: {
  onClose: () => void;
  onCreate: (rotation: Rotation) => void;
}) {
  const { people, currentUserId } = useApp();
  const [title, setTitle] = useState("Comprar agua");
  const [cadence, setCadence] = useState("Cuando se acaba");
  const [icon, setIcon] = useState<Rotation["icon"]>("water");
  const [queue, setQueue] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.id, true]))
  );

  const chosen = people.filter((p) => queue[p.id]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || chosen.length === 0) return;
    onCreate({
      id: uid("rotation"),
      title: title.trim(),
      cadence: cadence.trim() || "Por turnos",
      icon,
      queue: chosen.map((p) => p.id),
      currentIndex: 0,
      history: []
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet schedule-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Nuevo turno</p>
            <h2>Crear un turno rotativo</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <label>
          <span>¿Qué hay que hacer?</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Comprar agua" />
        </label>
        <label>
          <span>¿Cada cuándo?</span>
          <input value={cadence} onChange={(e) => setCadence(e.target.value)} placeholder="Ej: Cada semana" />
        </label>
        <label>
          <span>Ícono</span>
          <select value={icon} onChange={(e) => setIcon(e.target.value as Rotation["icon"])}>
            <option value="water">Agua</option>
            <option value="trash">Basura</option>
            <option value="plants">Plantas / otro</option>
          </select>
        </label>
        <div className="people-picker">
          {people.map((person) => {
            const on = queue[person.id];
            return (
              <div className={`share-row ${on ? "selected" : ""}`} key={person.id}>
                <button
                  className="check-person"
                  type="button"
                  onClick={() => setQueue((c) => ({ ...c, [person.id]: !c[person.id] }))}
                >
                  <Avatar person={person} size="sm" />
                  <span>{person.name}</span>
                  {on ? <Check size={18} /> : null}
                </button>
              </div>
            );
          })}
        </div>
        <p className="difference-note ok" style={{ marginTop: 0 }}>
          El orden de la lista marca quién va primero. Empieza por {chosen[0]?.name ?? "—"}.
        </p>
        <button className="primary-action full" type="submit" disabled={!title.trim() || !chosen.length}>
          <Plus size={19} />
          Crear turno
        </button>
        <input type="hidden" value={currentUserId} readOnly />
      </form>
    </div>
  );
}

function TasksView({
  rotations,
  onComplete,
  onCreate
}: {
  rotations: Rotation[];
  onComplete: (id: string) => void;
  onCreate: (rotation: Rotation) => void;
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Turnos rotativos</p>
          <h1>Sin cuentas en la pizarra.</h1>
        </div>
        <button className="primary-action" onClick={() => setShowForm(true)} type="button">
          <Plus size={19} />
          Nuevo turno
        </button>
      </div>
      {rotations.length ? (
        <div className="rotation-grid">
          {rotations.map((rotation) => (
            <RotationCard key={rotation.id} rotation={rotation} onComplete={onComplete} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <RotateCw size={28} />
          <strong>Aún no hay turnos</strong>
          <span>Crea el del agua para empezar.</span>
        </div>
      )}
      {showForm ? (
        <RotationForm
          onClose={() => setShowForm(false)}
          onCreate={(rotation) => {
            onCreate(rotation);
            setShowForm(false);
          }}
        />
      ) : null}
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
  const { people } = useApp();
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
      label: "Lavadora"
    });
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet schedule-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Lavadora</p>
            <h2>Agregar turno</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <label>
          <span>Persona</span>
          <select value={personId} onChange={(event) => setPersonId(event.target.value)}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Día</span>
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
            <span>Inicio</span>
            <input value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            <span>Fin</span>
            <input value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        <button className="primary-action full" type="submit">
          <Plus size={19} />
          Agregar turno
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
  const { getPerson } = useApp();
  const [showForm, setShowForm] = useState(false);

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Semana de lavadora</p>
          <h1>Turnos claros, menos sorpresas.</h1>
        </div>
        <button className="primary-action" onClick={() => setShowForm(true)} type="button">
          <Plus size={19} />
          Agregar turno
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
                <span className="open-slot">Libre</span>
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
  household
}: {
  expenses: Expense[];
  rotations: Rotation[];
  household: Household;
}) {
  const { people } = useApp();
  const [copied, setCopied] = useState(false);

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

  async function copyCode() {
    if (!household.invite_code) return;
    try {
      await navigator.clipboard.writeText(household.invite_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">La casa</p>
          <h1>Cada quien tiene un lugar claro.</h1>
        </div>
      </div>

      <div className="people-grid">
        {people.map((person) => {
          const balance = personBalance(person.id);
          const nextTurn = rotations.find(
            (rotation) => rotation.queue[rotation.currentIndex] === person.id
          );
          return (
            <article className="person-card" key={person.id}>
              <div className="person-card-top">
                <Avatar person={person} size="lg" />
                <div>
                  <strong>{person.name}</strong>
                  <span>{person.role === "admin" ? "Administrador" : "Miembro"}</span>
                </div>
              </div>
              <div className={`balance-pill ${balance >= 0 ? "positive" : "negative"}`}>
                <CircleDollarSign size={18} />
                <span>
                  {balance >= 0 ? "Recibe" : "Debe"} {money(Math.abs(balance))}
                </span>
              </div>
              <div className="next-turn-line">
                <RotateCw size={17} />
                <span>{nextTurn ? nextTurn.title : "Sin turno ahora"}</span>
              </div>
            </article>
          );
        })}
      </div>

      <div className="launch-panel">
        <div>
          <p className="eyebrow">Invitar</p>
          <h2>Suma a tu familia a {household.name}</h2>
        </div>
        <p className="invite-help">
          Comparte este código. Cada persona crea su cuenta y elige “Unirme con código”.
        </p>
        {household.invite_code ? (
          <button className="invite-code" onClick={copyCode} type="button">
            <KeyRound size={20} />
            <span>{household.invite_code}</span>
            <small>{copied ? "¡Copiado!" : "Toca para copiar"}</small>
          </button>
        ) : null}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Componente raíz
// ---------------------------------------------------------------------------
export function NestLoopApp({
  people,
  currentUserId,
  household,
  onSignOut
}: {
  people: Person[];
  currentUserId: string;
  household: Household;
  onSignOut: () => void;
}) {
  const [activeView, setActiveView] = useState<View>("home");
  const [expenses, setExpenses] = useStoredState<Expense[]>(`nestloop-expenses-${household.id}`, []);
  const [rotations, setRotations] = useStoredState<Rotation[]>(`nestloop-rotations-${household.id}`, []);
  const [slots, setSlots] = useStoredState<ScheduleSlot[]>(`nestloop-slots-${household.id}`, []);
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null);

  const appData = useMemo<AppData>(() => {
    const byId = new Map(people.map((p) => [p.id, p]));
    return {
      people,
      currentUserId,
      getPerson: (id: string) => byId.get(id) ?? { ...PLACEHOLDER, id }
    };
  }, [people, currentUserId]);

  const currentUser = appData.getPerson(currentUserId);
  const activeExpense = expenses.find((expense) => expense.id === activeExpenseId);

  const pendingCount = useMemo(() => {
    const myPending = expenses
      .flatMap((expense) => expense.shares.map((share) => ({ expense, share })))
      .filter(
        ({ expense, share }) =>
          share.personId === currentUserId &&
          expense.paidBy !== currentUserId &&
          share.status !== "confirmed"
      ).length;

    const confirmations = expenses
      .filter((expense) => expense.paidBy === currentUserId)
      .flatMap((expense) => expense.shares)
      .filter((share) => share.status === "sent").length;

    const turns = rotations.filter(
      (rotation) => rotation.queue[rotation.currentIndex] === currentUserId
    ).length;

    return myPending + confirmations + turns;
  }, [currentUserId, expenses, rotations]);

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
            { personId: currentPersonId, completedAt: new Date().toISOString(), note: "Hecho" },
            ...rotation.history
          ]
        };
      })
    );
  }

  return (
    <AppDataContext.Provider value={appData}>
      <main className="app-shell">
        <AppNav activeView={activeView} setActiveView={setActiveView} />
        <div className="app-main">
          <TopBar
            currentUser={currentUser}
            household={household}
            onSignOut={onSignOut}
            pendingCount={pendingCount}
          />

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

          {activeView === "tasks" ? (
            <TasksView
              rotations={rotations}
              onComplete={completeRotation}
              onCreate={(rotation) => setRotations((current) => [...current, rotation])}
            />
          ) : null}

          {activeView === "calendar" ? (
            <CalendarView
              currentUser={currentUser}
              slots={slots}
              onCreate={(slot) => setSlots((current) => [...current, slot])}
            />
          ) : null}

          {activeView === "people" ? (
            <PeopleView expenses={expenses} household={household} rotations={rotations} />
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
    </AppDataContext.Provider>
  );
}
