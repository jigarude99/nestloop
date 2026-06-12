"use client";

import {
  BadgeCheck,
  BellRing,
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
  HelpCircle,
  Home,
  KeyRound,
  LifeBuoy,
  LogOut,
  LucideIcon,
  MoreVertical,
  Pencil,
  Plus,
  ReceiptText,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  Users,
  WalletCards,
  X
} from "lucide-react";
import {
  createContext,
  CSSProperties,
  FormEvent,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { hasSupabaseConfig } from "../lib/supabase";
import { Household, Person } from "../lib/household";
import { BrandGlyph } from "./BrandGlyph";
import {
  createExpense as apiCreateExpense,
  createRotation as apiCreateRotation,
  createSlot as apiCreateSlot,
  completeRotation as apiCompleteRotation,
  deleteExpense as apiDeleteExpense,
  deleteRotation as apiDeleteRotation,
  deleteSlot as apiDeleteSlot,
  displayTime,
  fetchExpenses,
  fetchNotifications,
  fetchRotations,
  fetchSlots,
  markSharePaid,
  payExpenseForEveryone as apiPayExpenseForEveryone,
  registerPushNotifications,
  setShareStatus,
  signedUrl,
  triggerPushDispatch,
  undoRotation as apiUndoRotation,
  updateExpense as apiUpdateExpense,
  updateRotation as apiUpdateRotation,
  updateSlot as apiUpdateSlot,
  type Expense,
  type NewExpenseInput,
  type NewRotationInput,
  type NewSlotInput,
  type NotificationDelivery,
  type PaymentMethod,
  type PaymentStatus,
  type PushRegistrationResult,
  type Rotation,
  type RotationIcon,
  type ScheduleSlot
} from "../lib/api";

type View = "home" | "expenses" | "tasks" | "calendar" | "people";
type SplitMode = "equal" | "custom";

type NavItem = { view: View; label: string; icon: LucideIcon };

const NAV_ITEMS: NavItem[] = [
  { view: "home", label: "Inicio", icon: Home },
  { view: "expenses", label: "Gastos", icon: ReceiptText },
  { view: "tasks", label: "Turnos", icon: RotateCw },
  { view: "calendar", label: "Horarios", icon: CalendarDays },
  { view: "people", label: "Personas", icon: Users }
];

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CATEGORIES = ["Comida", "Agua", "Casa", "Limpieza", "Reembolso", "Otro"];

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
// Utilidades de formato
// ---------------------------------------------------------------------------
function money(value: number) {
  return new Intl.NumberFormat("es", { style: "currency", currency: "USD" }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat("es", { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`)
  );
}

function relativeTime(value?: string | null) {
  if (!value) return "Ahora";
  const diff = Date.now() - new Date(value).getTime();
  const minute = 60_000;
  const hour = minute * 60;
  const day = hour * 24;
  if (diff < minute) return "Ahora";
  if (diff < hour) return `Hace ${Math.max(1, Math.round(diff / minute))} min`;
  if (diff < day) return `Hace ${Math.max(1, Math.round(diff / hour))} h`;
  return `Hace ${Math.max(1, Math.round(diff / day))} d`;
}

function notificationStorageKey(householdId: string, userId: string) {
  return `nestloop:seen-notifications:${householdId}:${userId}`;
}

function notificationKindLabel(kind: NotificationDelivery["kind"]) {
  if (kind === "expense_due") return "Pago pendiente";
  if (kind === "payment_confirmation") return "Por confirmar";
  if (kind === "task_turn") return "Turno";
  return "Horario";
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
  return Array.from({ length: count }, (_, index) => fromCents(base + (index < remainder ? 1 : 0)));
}

function methodLabel(method?: PaymentMethod) {
  if (method === "transfer") return "Transferencia";
  if (method === "cash") return "Efectivo";
  if (method === "other") return "Otro";
  return undefined;
}

/** Mantener apretado (o clic derecho) para abrir el menú de acciones. */
function useLongPress(onLongPress: () => void, ms = 500) {
  const timer = useRef<number | null>(null);
  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return {
    onPointerDown: () => {
      clear();
      timer.current = window.setTimeout(onLongPress, ms);
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      onLongPress();
    }
  };
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
      <span className="avatar-letter">{person.initials}</span>
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

function rotationIcon(icon: RotationIcon) {
  if (icon === "water") return Droplets;
  if (icon === "trash") return RotateCcw;
  return Sparkles;
}

/** Muestra una imagen de un bucket privado usando una URL firmada. */
function SignedImage({
  bucket,
  path,
  alt
}: {
  bucket: "receipts" | "payment-proofs";
  path: string;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let on = true;
    signedUrl(bucket, path).then((u) => {
      if (on) setUrl(u);
    });
    return () => {
      on = false;
    };
  }, [bucket, path]);
  if (!url) return null;
  return <img className="receipt-img" src={url} alt={alt} />;
}

/** Hoja de acciones (Editar / Eliminar) con confirmación de borrado. */
function ItemActionsSheet({
  eyebrow,
  title,
  onEdit,
  onDelete,
  onClose
}: {
  eyebrow: string;
  title: string;
  onEdit?: () => void;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function doDelete() {
    setBusy(true);
    try {
      await onDelete();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-sheet actions-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {onEdit ? (
          <button className="secondary-action full" onClick={onEdit} type="button">
            <Pencil size={18} />
            Editar
          </button>
        ) : null}
        {!confirm ? (
          <button className="danger-action full" onClick={() => setConfirm(true)} type="button">
            <Trash2 size={18} />
            Eliminar
          </button>
        ) : (
          <button className="danger-action full" disabled={busy} onClick={doDelete} type="button">
            <Trash2 size={18} />
            {busy ? "Eliminando…" : "Sí, eliminar definitivamente"}
          </button>
        )}
        <button className="ghost-action full" onClick={onClose} type="button">
          Cancelar
        </button>
      </div>
    </div>
  );
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
          <BrandGlyph size={26} />
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
  unreadCount,
  notificationPermission,
  onNotificationsClick,
  onSignOut,
  onHelp
}: {
  currentUser: Person;
  household: Household;
  unreadCount: number;
  notificationPermission: NotificationPermission | PushRegistrationResult;
  onNotificationsClick: () => void;
  onSignOut: () => void;
  onHelp: () => void;
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
          <BrandGlyph size={22} />
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
        <button
          className={`notification-button ${notificationPermission === "granted" ? "enabled" : ""}`}
          onClick={onNotificationsClick}
          type="button"
          title={notificationPermission === "granted" ? "Ver notificaciones" : "Activar y ver notificaciones"}
          aria-label={`${unreadCount} notificaciones nuevas`}
        >
          <BellRing size={18} />
          {unreadCount > 0 ? <span>{unreadCount}</span> : null}
        </button>
        <button className="icon-button" onClick={onHelp} type="button" aria-label="Ayuda">
          <HelpCircle size={18} />
        </button>
        <button className="icon-button" onClick={onSignOut} type="button" aria-label="Cerrar sesión">
          <LogOut size={18} />
        </button>
      </div>
    </header>
  );
}

function NotificationsSheet({
  notifications,
  unreadIds,
  onClose,
  onMarkSeen,
  onSelect
}: {
  notifications: NotificationDelivery[];
  unreadIds: Set<string>;
  onClose: () => void;
  onMarkSeen: () => void;
  onSelect: (notification: NotificationDelivery) => void;
}) {
  const unread = notifications.filter((notification) => unreadIds.has(notification.id));
  const history = notifications.filter((notification) => !unreadIds.has(notification.id)).slice(0, 12);

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal-sheet notification-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Campana</p>
            <h2>Notificaciones</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {unread.length ? (
          <section className="notification-section">
            <div className="notification-section-title">
              <strong>Nuevas</strong>
              <span>{unread.length}</span>
            </div>
            <div className="notification-list">
              {unread.map((notification) => (
                <button
                  className="notification-row unread"
                  key={notification.id}
                  onClick={() => onSelect(notification)}
                  type="button"
                >
                  <span className="notification-dot" />
                  <span>
                    <strong>{notification.title}</strong>
                    <small>{notification.body}</small>
                    <em>
                      {notificationKindLabel(notification.kind)} ·{" "}
                      {relativeTime(notification.lastSentAt ?? notification.updatedAt)}
                    </em>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <div className="notification-empty">
            <CheckCircle2 size={24} />
            <strong>Todo visto</strong>
            <span>Cuando pase algo nuevo en casa, aparecerá aquí.</span>
          </div>
        )}

        {history.length ? (
          <section className="notification-section">
            <div className="notification-section-title">
              <strong>Historial reciente</strong>
            </div>
            <div className="notification-list compact">
              {history.map((notification) => (
                <button
                  className={`notification-row ${unreadIds.has(notification.id) ? "unread" : ""}`}
                  key={`history-${notification.id}`}
                  onClick={() => onSelect(notification)}
                  type="button"
                >
                  <span className="notification-kind">{notificationKindLabel(notification.kind)}</span>
                  <span>
                    <strong>{notification.title}</strong>
                    <em>{relativeTime(notification.lastSentAt ?? notification.updatedAt)}</em>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <button className="primary-action full" onClick={unread.length ? onMarkSeen : onClose} type="button">
          <BadgeCheck size={19} />
          {unread.length ? "Listo, marcar como vistas" : "Cerrar"}
        </button>
      </div>
    </div>
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
        <StatCard helper="A la espera" icon={HandCoins} label="Te deben" tone="mint" value={money(amountIncoming)} />
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
            <button className="action-row" key={rotation.id} onClick={() => setActiveView("tasks")} type="button">
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
  const progress = expense.shares.length ? Math.round((confirmed / expense.shares.length) * 100) : 0;

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
  initial,
  onClose,
  onSubmit
}: {
  currentUser: Person;
  initial?: Expense | null;
  onClose: () => void;
  onSubmit: (input: NewExpenseInput) => Promise<void>;
}) {
  const { people } = useApp();
  const isEdit = !!initial;
  const initialShares = initial
    ? Object.fromEntries(initial.shares.map((s) => [s.personId, s.amount]))
    : null;

  const [title, setTitle] = useState(initial?.title ?? "Compra compartida");
  const [merchant, setMerchant] = useState(initial?.merchant ?? "");
  const [category, setCategory] = useState(initial?.category ?? CATEGORIES[0]);
  const [amount, setAmount] = useState(initial ? String(initial.amount) : "");
  const [paidBy, setPaidBy] = useState(initial?.paidBy ?? currentUser.id);
  const [date, setDate] = useState(initial?.purchasedAt ?? new Date().toISOString().slice(0, 10));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [note, setNote] = useState(initial?.note ?? "");
  const [splitMode, setSplitMode] = useState<SplitMode>(() => {
    if (!initial || !initial.shares.length) return "equal";
    const amts = initial.shares.map((s) => s.amount);
    return amts.every((a) => Math.abs(a - amts[0]) < 0.01) ? "equal" : "custom";
  });
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.id, initialShares ? p.id in initialShares : true]))
  );
  const [hiddenFromNonParticipants, setHiddenFromNonParticipants] = useState(
    initial?.hiddenFromNonParticipants ?? false
  );
  const [customAmounts, setCustomAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      people.map((p) => [p.id, initialShares && p.id in initialShares ? String(initialShares[p.id]) : ""])
    )
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPeople = people.filter((person) => selected[person.id]);
  const total = parseMoney(amount);
  const evenAmounts = selectedPeople.length ? splitEvenly(total, selectedPeople.length) : [];
  const customTotal = selectedPeople.reduce(
    (sum, person) => sum + parseMoney(customAmounts[person.id] || "0"),
    0
  );
  const customDifference = total - customTotal;
  const validCustom = splitMode === "equal" || Math.abs(customDifference) < 0.01;
  const canSubmit = Boolean(title.trim() && total > 0 && selectedPeople.length > 0 && validCustom);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || saving) return;
    setSaving(true);
    setError(null);

    const participants = selectedPeople.map((person, index) => ({
      personId: person.id,
      amount: splitMode === "equal" ? evenAmounts[index] : parseMoney(customAmounts[person.id] || "0")
    }));

    try {
      await onSubmit({
        title: title.trim(),
        merchant: merchant.trim(),
        category,
        amount: total,
        paidBy,
        purchasedAt: date,
        note: note.trim(),
        receiptFile,
        hiddenFromNonParticipants,
        participants
      });
      onClose();
    } catch {
      setError("No se pudo guardar el gasto. Revisa tu conexión e intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet expense-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{isEdit ? "Editar" : "Nuevo gasto"}</p>
            <h2>{isEdit ? "Editar gasto" : "Agrega un gasto compartido"}</h2>
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
            <input placeholder="Ej: Walmart" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
          </label>
          <label>
            <span>Total</span>
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
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
          <span>{receiptFile?.name || (isEdit && initial?.receiptPath ? "Cambiar foto de la factura" : "Adjuntar foto de la factura")}</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
          />
        </label>

        <label>
          <span>Nota</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional" rows={3} />
        </label>

        <div className="split-toolbar">
          <span>Dividir</span>
          <div className="segmented">
            <button className={splitMode === "equal" ? "active" : ""} onClick={() => setSplitMode("equal")} type="button">
              Igual
            </button>
            <button className={splitMode === "custom" ? "active" : ""} onClick={() => setSplitMode("custom")} type="button">
              Personalizado
            </button>
          </div>
        </div>

        <div className="split-toolbar people-scope">
          <span>Personas incluidas</span>
          <button
            className="tiny-button"
            onClick={() => setSelected(Object.fromEntries(people.map((person) => [person.id, true])))}
            type="button"
          >
            Todos
          </button>
        </div>

        <div className="people-picker">
          {people.map((person) => {
            const isSelected = selected[person.id];
            return (
              <div className={`share-row ${isSelected ? "selected" : ""}`} key={person.id}>
                <button
                  className="check-person"
                  onClick={() => setSelected((current) => ({ ...current, [person.id]: !current[person.id] }))}
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
                      setCustomAmounts((current) => ({ ...current, [person.id]: event.target.value }))
                    }
                  />
                ) : (
                  <strong>{isSelected ? money(evenAmounts[selectedPeople.indexOf(person)] ?? 0) : money(0)}</strong>
                )}
              </div>
            );
          })}
        </div>

        <label className={`privacy-option ${hiddenFromNonParticipants ? "active" : ""}`}>
          <input
            checked={hiddenFromNonParticipants}
            onChange={(event) => setHiddenFromNonParticipants(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Ocultar a quienes no participan</strong>
            <small>Solo lo veran quien pago, quien lo creo y las personas seleccionadas.</small>
          </span>
        </label>

        {splitMode === "custom" ? (
          <div className={`difference-note ${validCustom ? "ok" : ""}`}>
            {validCustom
              ? "La división personalizada cuadra con el total."
              : `Faltan ${money(Math.abs(customDifference))} por cuadrar.`}
          </div>
        ) : null}

        {isEdit ? (
          <p className="form-hint">Al editar el monto o las personas, los pagos de este gasto se reinician.</p>
        ) : null}

        {error ? <div className="auth-alert error">{error}</div> : null}

        <button className="primary-action full" disabled={!canSubmit || saving} type="submit">
          <Plus size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear gasto"}
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
  onPayForEveryone,
  onConfirm,
  onReject,
  onEdit,
  onDelete
}: {
  expense: Expense;
  currentUser: Person;
  onClose: () => void;
  onMarkPaid: (expenseId: string, personId: string, method: PaymentMethod, proofFile: File | null) => Promise<void>;
  onPayForEveryone: (expense: Expense, method: PaymentMethod, proofFile: File | null) => Promise<void>;
  onConfirm: (expenseId: string, personId: string) => Promise<void>;
  onReject: (expenseId: string, personId: string) => Promise<void>;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => Promise<void>;
}) {
  const { getPerson } = useApp();
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [bulkMethod, setBulkMethod] = useState<PaymentMethod>("transfer");
  const [bulkProofFile, setBulkProofFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const payer = getPerson(expense.paidBy);
  const currentShare = expense.shares.find((share) => share.personId === currentUser.id);
  const needsProof = method !== "cash";
  const canSendPayment =
    !!currentShare && currentShare.status !== "confirmed" && (!needsProof || !!proofFile) && !busy;
  const canManage = expense.createdBy === currentUser.id || expense.paidBy === currentUser.id;
  const unsettledShares = expense.shares.filter(
    (share) => share.personId !== expense.paidBy && share.status !== "confirmed"
  );
  const bulkTotal = unsettledShares.reduce((sum, share) => sum + share.amount, 0);
  const reimbursementCount = unsettledShares.filter((share) => share.personId !== currentUser.id).length;
  const bulkNeedsProof = bulkMethod !== "cash";
  const canPayForEveryone =
    expense.paidBy !== currentUser.id &&
    unsettledShares.length > 0 &&
    reimbursementCount > 0 &&
    (!bulkNeedsProof || !!bulkProofFile) &&
    !busy;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

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
            {expense.receiptPath ? (
              <SignedImage bucket="receipts" path={expense.receiptPath} alt="Factura" />
            ) : (
              <>
                <ReceiptText size={28} />
                <span>Sin foto</span>
              </>
            )}
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
                    <small>{share.proofName ?? methodLabel(share.paymentMethod) ?? "Sin comprobante"}</small>
                  </span>
                </div>
                <strong>{money(share.amount)}</strong>
                <StatusBadge status={share.status} />
                {canReview ? (
                  <div className="row-actions">
                    <button
                      className="tiny-button good"
                      disabled={busy}
                      onClick={() => run(() => onConfirm(expense.id, share.personId))}
                      type="button"
                    >
                      Aceptar
                    </button>
                    <button
                      className="tiny-button"
                      disabled={busy}
                      onClick={() => run(() => onReject(expense.id, share.personId))}
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
                <button className={method === "transfer" ? "active" : ""} onClick={() => setMethod("transfer")} type="button">
                  Transferencia
                </button>
                <button className={method === "cash" ? "active" : ""} onClick={() => setMethod("cash")} type="button">
                  Efectivo
                </button>
              </div>
            </div>
            {method !== "cash" ? (
              <label className="file-pick">
                <Upload size={18} />
                <span>{proofFile?.name || "Subir captura del pago"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
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
              onClick={() => run(() => onMarkPaid(expense.id, currentUser.id, method, proofFile))}
              type="button"
            >
              <BadgeCheck size={19} />
              {busy ? "Guardando…" : `Marcar ${money(currentShare.amount)} pagado`}
            </button>
          </div>
        ) : null}

        {expense.paidBy !== currentUser.id && unsettledShares.length > 0 && reimbursementCount > 0 ? (
          <div className="payment-box bulk-pay-box">
            <div className="bulk-pay-heading">
              <div>
                <strong>Pagar por todos</strong>
                <span>
                  Pagas {money(bulkTotal)} a {payer.shortName}. Luego NestLoop crea un reembolso para{" "}
                  {reimbursementCount} {reimbursementCount === 1 ? "persona" : "personas"}.
                </span>
              </div>
              <HandCoins size={22} />
            </div>
            <div className="split-toolbar">
              <span>Como se pago</span>
              <div className="segmented">
                <button className={bulkMethod === "transfer" ? "active" : ""} onClick={() => setBulkMethod("transfer")} type="button">
                  Transferencia
                </button>
                <button className={bulkMethod === "cash" ? "active" : ""} onClick={() => setBulkMethod("cash")} type="button">
                  Efectivo
                </button>
              </div>
            </div>
            {bulkMethod !== "cash" ? (
              <label className="file-pick">
                <Upload size={18} />
                <span>{bulkProofFile?.name || "Subir comprobante del pago completo"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => setBulkProofFile(event.target.files?.[0] ?? null)}
                />
              </label>
            ) : (
              <div className="cash-note">
                <HandCoins size={19} />
                <span>El gasto original se cerrara y las deudas restantes pasaran a ti.</span>
              </div>
            )}
            <button
              className="secondary-action full"
              disabled={!canPayForEveryone}
              onClick={() => run(() => onPayForEveryone(expense, bulkMethod, bulkProofFile))}
              type="button"
            >
              <BadgeCheck size={19} />
              {busy ? "Guardando..." : `Pagar todo (${money(bulkTotal)})`}
            </button>
          </div>
        ) : null}

        {error ? <div className="auth-alert error">{error}</div> : null}

        {canManage ? (
          <div className="detail-actions">
            <button className="secondary-action" onClick={() => onEdit(expense)} type="button">
              <Pencil size={18} />
              Editar
            </button>
            {!confirmDelete ? (
              <button className="danger-action" onClick={() => setConfirmDelete(true)} type="button">
                <Trash2 size={18} />
                Eliminar
              </button>
            ) : (
              <button
                className="danger-action"
                disabled={busy}
                onClick={() => run(() => onDelete(expense))}
                type="button"
              >
                <Trash2 size={18} />
                {busy ? "Eliminando…" : "Sí, eliminar"}
              </button>
            )}
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

function ExpensesView({
  currentUser,
  expenses,
  onCreate,
  setActiveExpenseId
}: {
  currentUser: Person;
  expenses: Expense[];
  onCreate: (input: NewExpenseInput) => Promise<void>;
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
        <ExpenseForm currentUser={currentUser} onClose={() => setShowForm(false)} onSubmit={onCreate} />
      ) : null}
    </section>
  );
}

function RotationCard({
  rotation,
  onComplete,
  onUndo,
  onEdit,
  onDelete
}: {
  rotation: Rotation;
  onComplete: (rotation: Rotation) => Promise<void>;
  onUndo: (rotation: Rotation) => Promise<void>;
  onEdit: (rotation: Rotation) => void;
  onDelete: (rotation: Rotation) => Promise<void>;
}) {
  const { getPerson, currentUserId } = useApp();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const longPress = useLongPress(() => setShowActions(true));

  const Icon = rotationIcon(rotation.icon);
  const currentPerson = getPerson(rotation.queue[rotation.currentIndex]);
  const isMyTurn = rotation.queue[rotation.currentIndex] === currentUserId;
  const canUndo = rotation.history[0]?.personId === currentUserId;

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="rotation-card" {...longPress}>
      <div className="rotation-top">
        <IconBubble icon={Icon} tone="sky" />
        <div>
          <strong>{rotation.title}</strong>
          <span>{rotation.cadence}</span>
        </div>
        <button
          className="more-button"
          onClick={() => setShowActions(true)}
          type="button"
          aria-label="Opciones del turno"
        >
          <MoreVertical size={18} />
        </button>
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

      {isMyTurn ? (
        <button
          className="secondary-action full"
          disabled={busy}
          onClick={() => run(() => onComplete(rotation))}
          type="button"
        >
          <CheckCircle2 size={19} />
          {busy ? "Guardando…" : "Marcar hecho"}
        </button>
      ) : (
        <button className="secondary-action full" disabled type="button">
          <Clock3 size={19} />
          Le toca a {currentPerson.shortName}
        </button>
      )}

      {canUndo ? (
        <button className="undo-link" disabled={busy} onClick={() => run(() => onUndo(rotation))} type="button">
          <Undo2 size={15} />
          Deshacer mi turno
        </button>
      ) : null}

      {error ? <div className="auth-alert error">{error}</div> : null}

      <div className="history-list">
        {rotation.history.slice(0, 2).map((event) => (
          <div key={`${event.personId}-${event.completedAt}`}>
            <span>{getPerson(event.personId).shortName}</span>
            <small>{shortDate(event.completedAt.slice(0, 10))}</small>
          </div>
        ))}
      </div>

      {showActions ? (
        <ItemActionsSheet
          eyebrow="Turno"
          title={rotation.title}
          onClose={() => setShowActions(false)}
          onEdit={() => {
            setShowActions(false);
            onEdit(rotation);
          }}
          onDelete={() => onDelete(rotation)}
        />
      ) : null}
    </article>
  );
}

function RotationForm({
  initial,
  onClose,
  onSubmit
}: {
  initial?: Rotation | null;
  onClose: () => void;
  onSubmit: (input: NewRotationInput) => Promise<void>;
}) {
  const { people } = useApp();
  const isEdit = !!initial;
  const [title, setTitle] = useState(initial?.title ?? "Comprar agua");
  const [cadence, setCadence] = useState(initial?.cadence ?? "Cuando se acaba");
  const [icon, setIcon] = useState<RotationIcon>(initial?.icon ?? "water");
  const [queue, setQueue] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.id, initial ? initial.queue.includes(p.id) : true]))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = people.filter((p) => queue[p.id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || chosen.length === 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({
        title: title.trim(),
        cadence: cadence.trim() || "Por turnos",
        icon,
        queue: chosen.map((p) => p.id)
      });
      onClose();
    } catch {
      setError("No se pudo guardar el turno. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet schedule-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{isEdit ? "Editar" : "Nuevo turno"}</p>
            <h2>{isEdit ? "Editar turno" : "Crear un turno rotativo"}</h2>
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
          <select value={icon} onChange={(e) => setIcon(e.target.value as RotationIcon)}>
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
        {error ? <div className="auth-alert error">{error}</div> : null}
        <button className="primary-action full" type="submit" disabled={!title.trim() || !chosen.length || saving}>
          <Plus size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear turno"}
        </button>
      </form>
    </div>
  );
}

function TasksView({
  rotations,
  onComplete,
  onUndo,
  onCreate,
  onUpdate,
  onDelete
}: {
  rotations: Rotation[];
  onComplete: (rotation: Rotation) => Promise<void>;
  onUndo: (rotation: Rotation) => Promise<void>;
  onCreate: (input: NewRotationInput) => Promise<void>;
  onUpdate: (id: string, input: NewRotationInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Rotation | null>(null);

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
            <RotationCard
              key={rotation.id}
              rotation={rotation}
              onComplete={onComplete}
              onUndo={onUndo}
              onEdit={setEditing}
              onDelete={(r) => onDelete(r.id)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <RotateCw size={28} />
          <strong>Aún no hay turnos</strong>
          <span>Crea el del agua para empezar.</span>
        </div>
      )}
      {showForm ? <RotationForm onClose={() => setShowForm(false)} onSubmit={onCreate} /> : null}
      {editing ? (
        <RotationForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => onUpdate(editing.id, input)}
        />
      ) : null}
    </section>
  );
}

function ScheduleForm({
  currentUser,
  initial,
  onClose,
  onSubmit
}: {
  currentUser: Person;
  initial?: ScheduleSlot | null;
  onClose: () => void;
  onSubmit: (input: NewSlotInput) => Promise<void>;
}) {
  const { people } = useApp();
  const isEdit = !!initial;
  const [personId, setPersonId] = useState(initial?.personId ?? currentUser.id);
  const [day, setDay] = useState(String(initial?.day ?? 0));
  const [start, setStart] = useState(initial?.start ?? "18:00");
  const [end, setEnd] = useState(initial?.end ?? "20:00");
  const [label, setLabel] = useState(initial?.label ?? "Lavadora");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ personId, day: Number(day), start, end, label: label.trim() || "Lavadora" });
      onClose();
    } catch {
      setError("No se pudo guardar el horario. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="modal-sheet schedule-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">Horarios</p>
            <h2>{isEdit ? "Editar horario" : "Agregar horario"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <label>
          <span>¿Para qué?</span>
          <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ej: Lavadora" />
        </label>
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
            <input type="time" value={start} onChange={(event) => setStart(event.target.value)} />
          </label>
          <label>
            <span>Fin</span>
            <input type="time" value={end} onChange={(event) => setEnd(event.target.value)} />
          </label>
        </div>
        {error ? <div className="auth-alert error">{error}</div> : null}
        <button className="primary-action full" type="submit" disabled={saving}>
          <Plus size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar horario"}
        </button>
      </form>
    </div>
  );
}

function CalendarView({
  currentUser,
  slots,
  onCreate,
  onUpdate,
  onDelete
}: {
  currentUser: Person;
  slots: ScheduleSlot[];
  onCreate: (input: NewSlotInput) => Promise<void>;
  onUpdate: (id: string, input: NewSlotInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const { getPerson } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduleSlot | null>(null);
  const [actionsSlot, setActionsSlot] = useState<ScheduleSlot | null>(null);
  const canManageSlot = (slot: ScheduleSlot) => currentUser.role === "admin" || slot.createdBy === currentUser.id;

  return (
    <section className="view-stack">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Horarios de la semana</p>
          <h1>Turnos claros, menos sorpresas.</h1>
        </div>
        <button className="primary-action" onClick={() => setShowForm(true)} type="button">
          <Plus size={19} />
          Agregar horario
        </button>
      </div>

      <div className="calendar-grid">
        {DAYS.map((day, dayIndex) => {
          const daySlots = slots.filter((slot) => slot.day === dayIndex);
          return (
            <article className="day-card" key={day}>
              <strong className="day-name">{day}</strong>
              {daySlots.length ? (
                daySlots.map((slot) => {
                  const person = getPerson(slot.personId);
                  const canManage = canManageSlot(slot);
                  return (
                    <button
                      className={`slot-pill ${canManage ? "" : "readonly"}`}
                      key={slot.id}
                      type="button"
                      onClick={canManage ? () => setActionsSlot(slot) : undefined}
                      disabled={!canManage}
                      aria-label={`${person.shortName}, ${slot.label}, de ${displayTime(slot.start)} a ${displayTime(slot.end)}`}
                      style={{ "--slot-color": person.color, "--slot-tint": person.tint } as CSSProperties}
                    >
                      <Avatar person={person} size="sm" />
                      <span className="slot-copy">
                        <strong>{person.shortName}</strong>
                        <small className="slot-label">{slot.label}</small>
                        <small className="slot-time">
                          {displayTime(slot.start)} - {displayTime(slot.end)}
                        </small>
                      </span>
                    </button>
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
        <ScheduleForm currentUser={currentUser} onClose={() => setShowForm(false)} onSubmit={onCreate} />
      ) : null}
      {editing ? (
        <ScheduleForm
          currentUser={currentUser}
          initial={editing}
          onClose={() => setEditing(null)}
          onSubmit={(input) => onUpdate(editing.id, input)}
        />
      ) : null}
      {actionsSlot ? (
        <ItemActionsSheet
          eyebrow="Horario"
          title={`${getPerson(actionsSlot.personId).shortName} · ${DAYS[actionsSlot.day]}`}
          onClose={() => setActionsSlot(null)}
          onEdit={() => {
            setEditing(actionsSlot);
            setActionsSlot(null);
          }}
          onDelete={() => onDelete(actionsSlot.id)}
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
              share.personId === personId && expense.paidBy !== personId && share.status !== "confirmed"
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
          const nextTurn = rotations.find((rotation) => rotation.queue[rotation.currentIndex] === person.id);
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

function HelpSheet({ household, onClose }: { household: Household; onClose: () => void }) {
  const steps: { icon: LucideIcon; tone: string; title: string; body: string }[] = [
    {
      icon: ReceiptText,
      tone: "coral",
      title: "Agregar un gasto",
      body: "Toca “Agregar gasto”, pon el total, elige quién pagó y entre quiénes se divide. Puedes adjuntar la foto de la factura."
    },
    {
      icon: CreditCard,
      tone: "sun",
      title: "Pagar lo que debes",
      body: "Abre el gasto y toca “Marcar pagado”. Si pagaste por transferencia, sube la captura. Si fue en efectivo, queda esperando que confirmen."
    },
    {
      icon: ShieldCheck,
      tone: "mint",
      title: "Confirmar un pago en efectivo",
      body: "Cuando alguien te paga en efectivo, te aparece “Por aprobar”. Tú tocas “Aceptar” (o “Rechazar” si hay un error)."
    },
    {
      icon: RotateCw,
      tone: "sky",
      title: "Turnos (como el agua)",
      body: "En “Turnos” creas la lista. Cuando te toca, tocas “Marcar hecho” y le pasa al siguiente. Si le diste sin querer, usa “Deshacer”."
    },
    {
      icon: CalendarDays,
      tone: "violet",
      title: "Horarios",
      body: "En “Horarios” le pones a cada persona su día y su hora (lavadora, cocina, lo que sea). Toca un horario para editarlo o borrarlo."
    },
    {
      icon: Users,
      tone: "mint",
      title: "Invitar a tu familia",
      body: `Comparte el código ${household.invite_code ?? ""} de la casa. Cada persona crea su cuenta y elige “Unirme con código”.`
    }
  ];

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-sheet help-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Guía rápida</p>
            <h2>¿Cómo se usa NestLoop?</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <div className="help-list">
          {steps.map((step) => (
            <div className="help-step" key={step.title}>
              <IconBubble icon={step.icon} tone={step.tone} />
              <div>
                <strong>{step.title}</strong>
                <span>{step.body}</span>
              </div>
            </div>
          ))}
        </div>
        <button className="primary-action full" onClick={onClose} type="button">
          <LifeBuoy size={19} />
          Entendido
        </button>
      </div>
    </div>
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
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDelivery[]>([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | PushRegistrationResult
  >("unsupported");

  const hid = household.id;

  const reloadExpenses = useCallback(async () => {
    setExpenses(await fetchExpenses(hid));
  }, [hid]);
  const reloadRotations = useCallback(async () => {
    setRotations(await fetchRotations(hid));
  }, [hid]);
  const reloadSlots = useCallback(async () => {
    setSlots(await fetchSlots(hid));
  }, [hid]);
  const reloadNotifications = useCallback(async () => {
    setNotifications(await fetchNotifications(hid));
  }, [hid]);

  useEffect(() => {
    let on = true;
    setLoading(true);
    setLoadError(false);
    Promise.all([fetchExpenses(hid), fetchRotations(hid), fetchSlots(hid), fetchNotifications(hid)])
      .then(([e, r, s, n]) => {
        if (!on) return;
        setExpenses(e);
        setRotations(r);
        setSlots(s);
        setNotifications(n);
      })
      .catch(() => {
        if (on) setLoadError(true);
      })
      .finally(() => {
        if (on) setLoading(false);
      });
    return () => {
      on = false;
    };
  }, [hid]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(notificationStorageKey(hid, currentUserId));
      setSeenNotificationIds(new Set(raw ? (JSON.parse(raw) as string[]) : []));
    } catch {
      setSeenNotificationIds(new Set());
    }
  }, [currentUserId, hid]);

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

  const unreadNotificationIds = useMemo(() => {
    return new Set(
      notifications
        .filter((notification) => notification.status !== "resolved" && !seenNotificationIds.has(notification.id))
        .map((notification) => notification.id)
    );
  }, [notifications, seenNotificationIds]);

  const unreadNotificationCount = unreadNotificationIds.size;

  const rememberNotificationsSeen = useCallback(
    (ids: string[]) => {
      if (!ids.length || typeof window === "undefined") return;
      setSeenNotificationIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.add(id));
        window.localStorage.setItem(notificationStorageKey(hid, currentUserId), JSON.stringify([...next].slice(-200)));
        return next;
      });
    },
    [currentUserId, hid]
  );

  async function handleEnableNotifications(): Promise<PushRegistrationResult> {
    try {
      const result = await registerPushNotifications(hid, currentUserId);
      setNotificationPermission(result);
      if (result === "granted") void triggerPushDispatch();
      return result;
    } catch {
      setNotificationPermission("unsupported");
      return "unsupported";
    }
  }

  async function handleNotificationsClick() {
    if (notificationPermission !== "granted" && notificationPermission !== "denied") {
      await handleEnableNotifications();
    }
    await reloadNotifications().catch(() => {});
    setShowNotifications(true);
  }

  function handleMarkNotificationsSeen() {
    rememberNotificationsSeen([...unreadNotificationIds]);
    setShowNotifications(false);
  }

  function handleSelectNotification(notification: NotificationDelivery) {
    rememberNotificationsSeen([notification.id]);
    if (notification.kind === "expense_due" || notification.kind === "payment_confirmation") {
      setActiveView("expenses");
    } else if (notification.kind === "task_turn") {
      setActiveView("tasks");
    } else {
      setActiveView("calendar");
    }
    setShowNotifications(false);
  }

  // Acciones (lanzan error para que el formulario lo muestre)
  async function handleCreateExpense(input: NewExpenseInput) {
    await apiCreateExpense(hid, currentUserId, input);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateExpense(id: string, input: NewExpenseInput) {
    await apiUpdateExpense(hid, id, input);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleDeleteExpense(expense: Expense) {
    await apiDeleteExpense(expense);
    setActiveExpenseId(null);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }
  async function handleMarkPaid(
    expenseId: string,
    personId: string,
    method: PaymentMethod,
    proofFile: File | null
  ) {
    await markSharePaid(hid, expenseId, personId, method, proofFile);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handlePayForEveryone(expense: Expense, method: PaymentMethod, proofFile: File | null) {
    await apiPayExpenseForEveryone(hid, expense.id, currentUserId, method, proofFile);
    setActiveExpenseId(null);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleConfirm(expenseId: string, personId: string) {
    await setShareStatus(expenseId, personId, "confirmed");
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }
  async function handleReject(expenseId: string, personId: string) {
    await setShareStatus(expenseId, personId, "rejected");
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleCreateRotation(input: NewRotationInput) {
    await apiCreateRotation(hid, input);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateRotation(id: string, input: NewRotationInput) {
    await apiUpdateRotation(id, input);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
  }
  async function handleDeleteRotation(id: string) {
    await apiDeleteRotation(id);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
  }
  async function handleCompleteRotation(rotation: Rotation) {
    await apiCompleteRotation(rotation.id);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUndoRotation(rotation: Rotation) {
    await apiUndoRotation(rotation.id);
    await reloadRotations();
    await reloadNotifications().catch(() => {});
  }
  async function handleCreateSlot(input: NewSlotInput) {
    await apiCreateSlot(hid, currentUserId, input);
    await reloadSlots();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateSlot(id: string, input: NewSlotInput) {
    await apiUpdateSlot(id, input);
    await reloadSlots();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleDeleteSlot(id: string) {
    await apiDeleteSlot(id);
    await reloadSlots();
    await reloadNotifications().catch(() => {});
  }

  return (
    <AppDataContext.Provider value={appData}>
      <main className="app-shell">
        <AppNav activeView={activeView} setActiveView={setActiveView} />
        <div className="app-main">
          <TopBar
            currentUser={currentUser}
            household={household}
            notificationPermission={notificationPermission}
            onNotificationsClick={handleNotificationsClick}
            onHelp={() => setShowHelp(true)}
            onSignOut={onSignOut}
            unreadCount={unreadNotificationCount}
          />

          {loading ? (
            <div className="empty-state">
              <span className="loading-mark small">
                <RotateCw size={22} />
              </span>
              <strong>Cargando tu casa…</strong>
            </div>
          ) : loadError ? (
            <div className="empty-state">
              <Database size={28} />
              <strong>No se pudo cargar</strong>
              <span>Revisa tu conexión y vuelve a abrir la app.</span>
            </div>
          ) : (
            <>
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
                  onCreate={handleCreateExpense}
                  setActiveExpenseId={setActiveExpenseId}
                />
              ) : null}

              {activeView === "tasks" ? (
                <TasksView
                  rotations={rotations}
                  onComplete={handleCompleteRotation}
                  onUndo={handleUndoRotation}
                  onCreate={handleCreateRotation}
                  onUpdate={handleUpdateRotation}
                  onDelete={handleDeleteRotation}
                />
              ) : null}

              {activeView === "calendar" ? (
                <CalendarView
                  currentUser={currentUser}
                  slots={slots}
                  onCreate={handleCreateSlot}
                  onUpdate={handleUpdateSlot}
                  onDelete={handleDeleteSlot}
                />
              ) : null}

              {activeView === "people" ? (
                <PeopleView expenses={expenses} household={household} rotations={rotations} />
              ) : null}
            </>
          )}
        </div>

        {activeExpense ? (
          <ExpenseDetail
            currentUser={currentUser}
            expense={activeExpense}
            onClose={() => setActiveExpenseId(null)}
            onConfirm={handleConfirm}
            onMarkPaid={handleMarkPaid}
            onPayForEveryone={handlePayForEveryone}
            onReject={handleReject}
            onDelete={handleDeleteExpense}
            onEdit={(expense) => {
              setActiveExpenseId(null);
              setEditingExpense(expense);
            }}
          />
        ) : null}

        {editingExpense ? (
          <ExpenseForm
            currentUser={currentUser}
            initial={editingExpense}
            onClose={() => setEditingExpense(null)}
            onSubmit={(input) => handleUpdateExpense(editingExpense.id, input)}
          />
        ) : null}

        {showHelp ? <HelpSheet household={household} onClose={() => setShowHelp(false)} /> : null}
        {showNotifications ? (
          <NotificationsSheet
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
            onMarkSeen={handleMarkNotificationsSeen}
            onSelect={handleSelectNotification}
            unreadIds={unreadNotificationIds}
          />
        ) : null}
      </main>
    </AppDataContext.Provider>
  );
}
