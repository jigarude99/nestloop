"use client";

import {
  BadgeCheck,
  BellRing,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  CreditCard,
  Database,
  Droplets,
  HandCoins,
  Handshake,
  HelpCircle,
  History,
  Home,
  Image as ImageIcon,
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
  Scale,
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
  createRecurringBill as apiCreateRecurringBill,
  createRotation as apiCreateRotation,
  createSlot as apiCreateSlot,
  completeRotation as apiCompleteRotation,
  billActivePeriod,
  lastPaidPeriod,
  periodDueDate,
  periodMonthName,
  deleteExpense as apiDeleteExpense,
  deleteRecurringBill as apiDeleteRecurringBill,
  deleteRotation as apiDeleteRotation,
  deleteSlot as apiDeleteSlot,
  displayTime,
  fetchExpenses,
  fetchNotifications,
  fetchRecurringBills,
  fetchRotations,
  fetchSettlements,
  fetchSlots,
  markRecurringPaid as apiMarkRecurringPaid,
  markSharePaid,
  unmarkRecurringPaid as apiUnmarkRecurringPaid,
  updateRecurringBill as apiUpdateRecurringBill,
  payExpenseForEveryone as apiPayExpenseForEveryone,
  ensurePushSubscription,
  registerPushNotifications,
  setShareStatus,
  settleWith as apiSettleWith,
  signedUrl,
  triggerPushDispatch,
  undoRotation as apiUndoRotation,
  undoSettlement as apiUndoSettlement,
  updateExpense as apiUpdateExpense,
  updateRotation as apiUpdateRotation,
  updateSlot as apiUpdateSlot,
  type Expense,
  type NewExpenseInput,
  type NewRecurringBillInput,
  type NewRotationInput,
  type NewSlotInput,
  type NotificationDelivery,
  type PaymentMethod,
  type PaymentStatus,
  type PushRegistrationResult,
  type RecurringBill,
  type Rotation,
  type RotationIcon,
  type ScheduleSlot,
  type Settlement
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
const DAYS_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
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
const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function money(value: number) {
  return moneyFormatter.format(value);
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
  if (kind === "recurring_due") return "Pago mensual";
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
  const clean = value.trim().replace(/[^\d.,-]/g, "");
  if (!clean) return 0;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");
  const separatorIndex = Math.max(lastComma, lastDot);
  const digitsAfterSeparator = separatorIndex >= 0 ? clean.length - separatorIndex - 1 : 0;
  const shouldUseDecimal =
    separatorIndex >= 0 &&
    digitsAfterSeparator > 0 &&
    (digitsAfterSeparator <= 2 || (lastComma >= 0 && lastDot >= 0));

  const normalized = shouldUseDecimal
    ? `${clean.slice(0, separatorIndex).replace(/[.,]/g, "")}.${clean
        .slice(separatorIndex + 1)
        .replace(/[.,]/g, "")}`
    : clean.replace(/[.,]/g, "");
  const parsed = Number(normalized);
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

type PairItem = { expenseId: string; title: string; amount: number };
type Pairwise = {
  iOweItems: PairItem[];
  theyOweItems: PairItem[];
  iOwe: number;
  theyOwe: number;
  net: number; // >0 yo le debo a la otra persona; <0 me debe; 0 a mano
};

/** Cuentas abiertas entre el usuario actual (meId) y otra persona (otherId). */
function pairwiseBalance(expenses: Expense[], meId: string, otherId: string): Pairwise {
  const iOweItems: PairItem[] = [];
  const theyOweItems: PairItem[] = [];
  for (const expense of expenses) {
    if (expense.paidBy === otherId) {
      const mine = expense.shares.find((s) => s.personId === meId && s.status !== "confirmed");
      if (mine && mine.amount > 0) iOweItems.push({ expenseId: expense.id, title: expense.title, amount: mine.amount });
    } else if (expense.paidBy === meId) {
      const theirs = expense.shares.find((s) => s.personId === otherId && s.status !== "confirmed");
      if (theirs && theirs.amount > 0)
        theyOweItems.push({ expenseId: expense.id, title: expense.title, amount: theirs.amount });
    }
  }
  const iOwe = iOweItems.reduce((sum, i) => sum + i.amount, 0);
  const theyOwe = theyOweItems.reduce((sum, i) => sum + i.amount, 0);
  return { iOweItems, theyOweItems, iOwe, theyOwe, net: iOwe - theyOwe };
}

type BodyLockSnapshot = {
  position: string;
  top: string;
  left: string;
  right: string;
  overflow: string;
};

let bodyLockCount = 0;
let bodyLockY = 0;
let bodyLockSnapshot: BodyLockSnapshot | null = null;

/** Bloquea el scroll del fondo mientras un modal está abierto (robusto en iOS). */
function useBodyScrollLock() {
  useEffect(() => {
    const { style } = document.body;
    if (bodyLockCount === 0) {
      bodyLockY = window.scrollY;
      bodyLockSnapshot = {
        position: style.position,
        top: style.top,
        left: style.left,
        right: style.right,
        overflow: style.overflow
      };
      style.position = "fixed";
      style.top = `-${bodyLockY}px`;
      style.left = "0";
      style.right = "0";
      style.overflow = "hidden";
    }
    bodyLockCount += 1;

    return () => {
      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount !== 0 || !bodyLockSnapshot) return;
      style.position = bodyLockSnapshot.position;
      style.top = bodyLockSnapshot.top;
      style.left = bodyLockSnapshot.left;
      style.right = bodyLockSnapshot.right;
      style.overflow = bodyLockSnapshot.overflow;
      bodyLockSnapshot = null;
      window.scrollTo(0, bodyLockY);
    };
  }, []);
}

/** Fondo común de todos los modales: centra la hoja y bloquea el scroll de atrás.
 *  Si recibe onClose, tocar fuera de la hoja cierra el modal. */
function ModalBackdrop({
  children,
  onClose
}: {
  children: React.ReactNode;
  onClose?: () => void;
}) {
  useBodyScrollLock();
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={onClose ? (e) => { if (e.target === e.currentTarget) onClose(); } : undefined}
    >
      {children}
    </div>
  );
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
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let on = true;
    setUrl(null);
    setFailed(false);
    signedUrl(bucket, path)
      .then((u) => {
        if (on) setUrl(u);
      })
      .catch(() => {
        if (on) setFailed(true);
      });
    return () => {
      on = false;
    };
  }, [bucket, path]);
  if (failed) return <div className="image-state error">No se pudo cargar la foto.</div>;
  if (!url) return <div className="image-state loading" aria-label="Cargando foto" />;
  return <img className="receipt-img" src={url} alt={alt} />;
}

/**
 * Visor de foto con zoom: pellizcar (dos dedos), doble toque / doble clic,
 * arrastrar cuando está acercada y rueda del ratón. Sin dependencias.
 */
function ZoomableImage({
  bucket,
  path,
  alt
}: {
  bucket: "receipts" | "payment-proofs";
  path: string;
  alt: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [zoomed, setZoomed] = useState(false);
  const st = useRef({
    scale: 1,
    tx: 0,
    ty: 0,
    pts: new Map<number, { x: number; y: number }>(),
    startDist: 0,
    startScale: 1,
    panX: 0,
    panY: 0,
    startTx: 0,
    startTy: 0,
    lastTap: 0,
    moved: false
  });

  useEffect(() => {
    let on = true;
    setUrl(null);
    setFailed(false);
    signedUrl(bucket, path)
      .then((u) => {
        if (on) setUrl(u);
      })
      .catch(() => {
        if (on) setFailed(true);
      });
    return () => {
      on = false;
    };
  }, [bucket, path]);

  const apply = useCallback(() => {
    const s = st.current;
    // Al 100% vuelve al centro; acercada, limita el arrastre al borde de la foto.
    s.scale = Math.min(5, Math.max(1, s.scale));
    const stage = stageRef.current;
    if (stage) {
      const maxX = ((s.scale - 1) * stage.clientWidth) / 2;
      const maxY = ((s.scale - 1) * stage.clientHeight) / 2;
      s.tx = Math.min(maxX, Math.max(-maxX, s.tx));
      s.ty = Math.min(maxY, Math.max(-maxY, s.ty));
    }
    if (s.scale === 1) {
      s.tx = 0;
      s.ty = 0;
    }
    const img = imgRef.current;
    if (img) img.style.transform = `translate(${s.tx}px, ${s.ty}px) scale(${s.scale})`;
    setZoomed(s.scale > 1.02);
  }, []);

  const zoomAt = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const s = st.current;
      const stage = stageRef.current;
      if (!stage) return;
      const rect = stage.getBoundingClientRect();
      const px = clientX - rect.left - rect.width / 2;
      const py = clientY - rect.top - rect.height / 2;
      const clamped = Math.min(5, Math.max(1, nextScale));
      const ratio = clamped / s.scale;
      s.tx = px - (px - s.tx) * ratio;
      s.ty = py - (py - s.ty) * ratio;
      s.scale = clamped;
      apply();
    },
    [apply]
  );

  function onPointerDown(e: React.PointerEvent) {
    const s = st.current;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    s.moved = false;
    if (s.pts.size === 2) {
      const [a, b] = [...s.pts.values()];
      s.startDist = Math.hypot(a.x - b.x, a.y - b.y);
      s.startScale = s.scale;
    } else if (s.pts.size === 1) {
      s.panX = e.clientX;
      s.panY = e.clientY;
      s.startTx = s.tx;
      s.startTy = s.ty;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const s = st.current;
    if (!s.pts.has(e.pointerId)) return;
    const prev = s.pts.get(e.pointerId)!;
    if (Math.hypot(e.clientX - prev.x, e.clientY - prev.y) > 6) s.moved = true;
    s.pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (s.pts.size === 2) {
      const [a, b] = [...s.pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (s.startDist > 0) {
        zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, s.startScale * (dist / s.startDist));
      }
    } else if (s.pts.size === 1 && s.scale > 1) {
      s.tx = s.startTx + (e.clientX - s.panX);
      s.ty = s.startTy + (e.clientY - s.panY);
      apply();
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const s = st.current;
    s.pts.delete(e.pointerId);
    if (s.pts.size === 1) {
      // Quedó un dedo tras el pellizco: re-ancla el arrastre.
      const [p] = [...s.pts.values()];
      s.panX = p.x;
      s.panY = p.y;
      s.startTx = s.tx;
      s.startTy = s.ty;
    }
    if (s.pts.size === 0 && !s.moved && e.pointerType === "touch") {
      const now = Date.now();
      if (now - s.lastTap < 320) {
        zoomAt(e.clientX, e.clientY, s.scale > 1.02 ? 1 : 2.5);
        s.lastTap = 0;
      } else {
        s.lastTap = now;
      }
    }
  }

  if (failed) return <div className="image-state error">No se pudo cargar el comprobante.</div>;
  if (!url) return <div className="image-state loading large" aria-label="Cargando comprobante" />;
  return (
    <div
      className={`zoom-stage ${zoomed ? "zoomed" : ""}`}
      ref={stageRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => zoomAt(e.clientX, e.clientY, st.current.scale > 1.02 ? 1 : 2.5)}
      onWheel={(e) => {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, st.current.scale * (e.deltaY < 0 ? 1.18 : 0.85));
      }}
    >
      <img ref={imgRef} src={url} alt={alt} draggable={false} />
      {!zoomed ? <span className="zoom-hint">Pellizca o toca 2 veces para acercar</span> : null}
    </div>
  );
}

/** Selector de foto con dos opciones claras: tomar con la cámara o elegir de galería. */
function PhotoPicker({
  file,
  onPick,
  label,
  icon: Icon = Camera
}: {
  file: File | null;
  onPick: (file: File | null) => void;
  label: string;
  icon?: LucideIcon;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  function clearPhoto() {
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
    onPick(null);
  }

  return (
    <div className="photo-picker">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => onPick(event.target.files?.[0] ?? null)}
      />
      <div className="photo-picker-head">
        <Icon size={18} />
        <span>{file ? file.name : label}</span>
        {file ? (
          <button className="photo-clear" type="button" onClick={clearPhoto} aria-label="Quitar foto">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <div className="photo-picker-actions">
        <button type="button" onClick={() => cameraRef.current?.click()}>
          <Camera size={17} />
          Cámara
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()}>
          <ImageIcon size={17} />
          Galería
        </button>
      </div>
    </div>
  );
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
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet actions-sheet">
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
    </ModalBackdrop>
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
              aria-current={active ? "page" : undefined}
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
  activeView,
  currentUser,
  household,
  unreadCount,
  notificationPermission,
  onNotificationsClick,
  onProfileClick
}: {
  activeView: View;
  currentUser: Person;
  household: Household;
  unreadCount: number;
  notificationPermission: NotificationPermission | PushRegistrationResult;
  onNotificationsClick: () => void;
  onProfileClick: () => void;
}) {
  const activeLabel = NAV_ITEMS.find((item) => item.view === activeView)?.label ?? "Inicio";

  return (
    <header className="top-bar">
      <div className="mobile-brand">
        <span className="brand-mark">
          <BrandGlyph size={22} />
        </span>
        <div>
          <span>{household.name}</span>
          <strong>{activeLabel}</strong>
        </div>
      </div>
      <div className="top-greeting">
        <p className="eyebrow">{household.name}</p>
        <strong>Hola, {currentUser.name}</strong>
      </div>
      <div className="top-actions">
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
        <button className="profile-button" onClick={onProfileClick} type="button" aria-label="Mi perfil">
          <Avatar person={currentUser} size="sm" />
          <span className="profile-button-name">{currentUser.shortName}</span>
        </button>
      </div>
    </header>
  );
}

/** Hoja de perfil: tu cuenta, la casa, el código de invitación, ayuda y salir. */
function ProfileSheet({
  currentUser,
  household,
  notificationPermission,
  onEnableNotifications,
  onHelp,
  onHistory,
  onSignOut,
  onClose
}: {
  currentUser: Person;
  household: Household;
  notificationPermission: NotificationPermission | PushRegistrationResult;
  onEnableNotifications: () => Promise<PushRegistrationResult>;
  onHelp: () => void;
  onHistory: () => void;
  onSignOut: () => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [enabling, setEnabling] = useState(false);

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

  async function enableNotifications() {
    setEnabling(true);
    try {
      await onEnableNotifications();
    } finally {
      setEnabling(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet profile-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Mi perfil</p>
            <h2>{currentUser.name}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="profile-summary">
          <Avatar person={currentUser} size="lg" />
          <div>
            <strong>{household.name}</strong>
            <span>
              {currentUser.role === "admin" ? "Administrador" : "Miembro"} ·{" "}
              {hasSupabaseConfig ? "En la nube" : "Local"}
            </span>
          </div>
        </div>

        {household.invite_code ? (
          <button className="invite-code compact" onClick={copyCode} type="button">
            <KeyRound size={18} />
            <span>{household.invite_code}</span>
            <small>{copied ? "¡Copiado!" : "Código para invitar · toca para copiar"}</small>
          </button>
        ) : null}

        {notificationPermission !== "granted" ? (
          <button className="secondary-action full" disabled={enabling} onClick={enableNotifications} type="button">
            <BellRing size={18} />
            {enabling
              ? "Activando…"
              : notificationPermission === "denied"
                ? "Avisos bloqueados en el navegador"
                : "Activar avisos en este teléfono"}
          </button>
        ) : (
          <div className="profile-note">
            <BellRing size={16} />
            <span>Los avisos están activados en este dispositivo.</span>
          </div>
        )}

        <button className="secondary-action full" onClick={onHelp} type="button">
          <HelpCircle size={18} />
          ¿Cómo se usa NestLoop?
        </button>

        <button className="secondary-action full" onClick={onHistory} type="button">
          <History size={18} />
          Historial de la casa
        </button>

        <button className="danger-action full" onClick={onSignOut} type="button">
          <LogOut size={18} />
          Cerrar sesión
        </button>
      </div>
    </ModalBackdrop>
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
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet notification-sheet">
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
    </ModalBackdrop>
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
  recurringBills,
  setActiveView,
  setActiveExpenseId,
  onOpenMonthly
}: {
  currentUser: Person;
  expenses: Expense[];
  rotations: Rotation[];
  recurringBills: RecurringBill[];
  setActiveView: (view: View) => void;
  setActiveExpenseId: (id: string) => void;
  onOpenMonthly: () => void;
}) {
  const { getPerson } = useApp();

  // Pagos mensuales cuyo periodo activo vence en ≤7 días (o ya venció) y no he pagado
  const monthlyDue = recurringBills
    .flatMap((bill) => {
      const myShare = bill.shares.find((s) => s.personId === currentUser.id);
      if (!myShare || myShare.amount <= 0) return [];
      const period = billActivePeriod(bill);
      const iPaid = bill.payments.some((p) => p.period === period && p.personId === currentUser.id);
      if (iPaid) return [];
      // Días completos desde la medianoche de hoy (igual que la tarjeta de Mensual)
      const now = new Date();
      const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
      const daysLeft = Math.round((periodDueDate(period, bill.dueDay).getTime() - todayUtc) / 86_400_000);
      if (daysLeft > 7) return [];
      return [{ bill, amount: myShare.amount, period, daysLeft }];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft);

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
  const urgentCount = monthlyDue.length + myOpenShares.length + needsConfirmation.length + currentTurns.length;

  return (
    <section className="view-stack">
      <div className="home-intro">
        <div>
          <p className="eyebrow">Hoy para {currentUser.name}</p>
          <h1>{urgentCount ? `${urgentCount} ${urgentCount === 1 ? "cosa" : "cosas"} por revisar` : "Todo está al día"}</h1>
          <p className="home-intro-copy">
            {urgentCount ? "Empieza por lo más importante y sigue con tu día." : "No tienes pagos ni turnos urgentes ahora mismo."}
          </p>
        </div>
        <button className="primary-action home-add-action" onClick={() => setActiveView("expenses")} type="button">
          <ReceiptText size={19} />
          Nuevo gasto
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
          <p className="eyebrow">Para ti</p>
          <h2>Lo próximo</h2>
        </div>
        {urgentCount ? <span className="section-count">{urgentCount}</span> : null}
      </div>

      <div className="action-list">
        {monthlyDue.slice(0, 2).map(({ bill, amount, period, daysLeft }) => {
          const dueLabel =
            daysLeft < 0
              ? `Vencida hace ${-daysLeft} día${-daysLeft === 1 ? "" : "s"}`
              : daysLeft === 0
                ? "Vence hoy"
                : daysLeft === 1
                  ? "Vence mañana"
                  : `Vence en ${daysLeft} días`;
          return (
            <button className="action-row" key={`bill-${bill.id}`} onClick={onOpenMonthly} type="button">
              <IconBubble icon={CalendarDays} tone={daysLeft < 0 ? "coral" : "sun"} />
              <span>
                <strong>Pagar {bill.title} ({money(amount)})</strong>
                <small>{dueLabel} · {periodMonthName(period)}</small>
              </span>
              <ChevronRight size={19} />
            </button>
          );
        })}

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

        {!monthlyDue.length && !myOpenShares.length && !needsConfirmation.length && !currentTurns.length ? (
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
              <p className="eyebrow">En la casa</p>
              <h2>Turnos actuales</h2>
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
  const { getPerson, currentUserId } = useApp();
  const paidBy = getPerson(expense.paidBy);
  const confirmed = expense.shares.filter((share) => share.status === "confirmed").length;
  const progress = expense.shares.length ? Math.round((confirmed / expense.shares.length) * 100) : 0;

  const allDone = expense.shares.length > 0 && confirmed === expense.shares.length;
  const myShare = expense.shares.find((share) => share.personId === currentUserId);
  const waitingFor = expense.shares.filter(
    (share) => share.personId !== currentUserId && share.status !== "confirmed"
  ).length;

  let status = "No participas";
  let statusTone = "muted";
  if (expense.paidBy === currentUserId) {
    status = allDone ? "Saldado" : `${waitingFor} ${waitingFor === 1 ? "persona pendiente" : "personas pendientes"}`;
    statusTone = allDone ? "done" : "incoming";
  } else if (myShare) {
    if (myShare.status === "confirmed") {
      status = "Tu parte está saldada";
      statusTone = "done";
    } else if (myShare.status === "sent") {
      status = "Pago enviado";
      statusTone = "sent";
    } else if (myShare.status === "rejected") {
      status = `Revisa tu pago de ${money(myShare.amount)}`;
      statusTone = "danger";
    } else {
      status = `Debes ${money(myShare.amount)}`;
      statusTone = "danger";
    }
  }

  return (
    <button className="expense-card" onClick={() => onOpen(expense.id)} type="button">
      <div className="receipt-thumb">
        <ReceiptText size={18} />
      </div>
      <div className="expense-card-info">
        <strong>{expense.title}</strong>
        <small>
          Pagó {paidBy.shortName} · {shortDate(expense.purchasedAt)}
        </small>
        <span className={`expense-status ${statusTone}`}>{status}</span>
      </div>
      <div className="expense-card-amount">
        <strong>{money(expense.amount)}</strong>
        <small>{confirmed}/{expense.shares.length}</small>
      </div>
      <span className="expense-card-progress" aria-label={`${progress}% confirmado`}>
        <span style={{ width: `${progress}%` }} />
      </span>
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
    <ModalBackdrop>
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

        <PhotoPicker
          file={receiptFile}
          onPick={setReceiptFile}
          label={isEdit && initial?.receiptPath ? "Cambiar foto de la factura" : "Adjuntar foto de la factura"}
        />

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
    </ModalBackdrop>
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
  const [viewingReceipt, setViewingReceipt] = useState(false);
  const receiptHistoryPushedRef = useRef(false);
  const [viewingProof, setViewingProof] = useState<{ path: string; person: string } | null>(null);
  const proofHistoryPushedRef = useRef(false);

  const payer = getPerson(expense.paidBy);
  const currentShare = expense.shares.find((share) => share.personId === currentUser.id);
  const needsProof = method !== "cash";
  const canSendPayment =
    !!currentShare && currentShare.status !== "confirmed" && (!needsProof || !!proofFile) && !busy;
  const canManage =
    expense.createdBy === currentUser.id ||
    expense.paidBy === currentUser.id ||
    currentUser.role === "admin";
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

  useEffect(() => {
    if (!viewingReceipt) return;
    const closeFromBack = () => {
      receiptHistoryPushedRef.current = false;
      setViewingReceipt(false);
    };
    window.addEventListener("popstate", closeFromBack);
    return () => window.removeEventListener("popstate", closeFromBack);
  }, [viewingReceipt]);

  function openReceiptViewer() {
    if (!expense.receiptPath) return;
    setViewingReceipt(true);
    if (!receiptHistoryPushedRef.current) {
      window.history.pushState({ nestloopReceiptViewer: expense.id }, "", window.location.href);
      receiptHistoryPushedRef.current = true;
    }
  }

  function closeReceiptViewer() {
    if (receiptHistoryPushedRef.current && window.history.state?.nestloopReceiptViewer === expense.id) {
      window.history.back();
      return;
    }
    receiptHistoryPushedRef.current = false;
    setViewingReceipt(false);
  }

  useEffect(() => {
    if (!viewingProof) return;
    const closeFromBack = () => {
      proofHistoryPushedRef.current = false;
      setViewingProof(null);
    };
    window.addEventListener("popstate", closeFromBack);
    return () => window.removeEventListener("popstate", closeFromBack);
  }, [viewingProof]);

  function openProofViewer(path: string, person: string) {
    setViewingProof({ path, person });
    if (!proofHistoryPushedRef.current) {
      window.history.pushState({ nestloopProofViewer: expense.id }, "", window.location.href);
      proofHistoryPushedRef.current = true;
    }
  }

  function closeProofViewer() {
    if (proofHistoryPushedRef.current && window.history.state?.nestloopProofViewer === expense.id) {
      window.history.back();
      return;
    }
    proofHistoryPushedRef.current = false;
    setViewingProof(null);
  }

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
    <ModalBackdrop onClose={onClose}>
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
              <button
                className="receipt-open-button"
                onClick={openReceiptViewer}
                type="button"
                aria-label="Ver factura completa"
              >
                <SignedImage bucket="receipts" path={expense.receiptPath} alt="Factura" />
                <span className="receipt-open-hint">
                  <ImageIcon size={15} />
                  Ver completa
                </span>
              </button>
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
                    {share.proofPath ? (
                      <button
                        className="proof-link"
                        type="button"
                        onClick={() => openProofViewer(share.proofPath!, person.name)}
                      >
                        <ImageIcon size={13} />
                        Ver comprobante
                      </button>
                    ) : (
                      <small>{methodLabel(share.paymentMethod) ?? "Sin comprobante"}</small>
                    )}
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
              <PhotoPicker file={proofFile} onPick={setProofFile} label="Subir captura del pago" icon={Upload} />
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
              <PhotoPicker file={bulkProofFile} onPick={setBulkProofFile} label="Subir comprobante del pago completo" icon={Upload} />
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

      {viewingReceipt && expense.receiptPath ? (
        <ModalBackdrop onClose={closeReceiptViewer}>
          <div className="modal-sheet photo-sheet receipt-full-sheet">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Factura completa</p>
                <h2>{expense.title}</h2>
              </div>
              <button className="icon-button" onClick={closeReceiptViewer} type="button" aria-label="Volver al gasto">
                <X size={20} />
              </button>
            </div>
            <ZoomableImage bucket="receipts" path={expense.receiptPath} alt={`Factura de ${expense.title}`} />
          </div>
        </ModalBackdrop>
      ) : null}

      {viewingProof ? (
        <ModalBackdrop onClose={closeProofViewer}>
          <div className="modal-sheet photo-sheet receipt-full-sheet">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Comprobante de pago</p>
                <h2>{viewingProof.person}</h2>
              </div>
              <button className="icon-button" onClick={closeProofViewer} type="button" aria-label="Volver al gasto">
                <X size={20} />
              </button>
            </div>
            <ZoomableImage bucket="payment-proofs" path={viewingProof.path} alt={`Comprobante de ${viewingProof.person}`} />
          </div>
        </ModalBackdrop>
      ) : null}
    </ModalBackdrop>
  );
}

// ---------------------------------------------------------------------------
// PAGOS MENSUALES EN CONJUNTO (renta, etc.)
// ---------------------------------------------------------------------------
/** Estado del vencimiento del PERIODO ACTIVO para mostrar en la tarjeta. */
function recurringDueStatus(
  period: string,
  dueDay: number
): { daysLeft: number; label: string; tone: "soon" | "today" | "overdue" | "future" } {
  const now = new Date();
  const due = periodDueDate(period, dueDay).getTime();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const daysLeft = Math.round((due - todayUtc) / 86_400_000);
  const day = Math.min(dueDay, 28);
  if (daysLeft < 0) return { daysLeft, label: `Vencida hace ${-daysLeft} día${-daysLeft === 1 ? "" : "s"}`, tone: "overdue" };
  if (daysLeft === 0) return { daysLeft, label: "Vence hoy", tone: "today" };
  if (daysLeft === 1) return { daysLeft, label: "Vence mañana", tone: "today" };
  if (daysLeft <= 7) return { daysLeft, label: `Faltan ${daysLeft} días`, tone: "soon" };
  return { daysLeft, label: `Próximo: ${day} de ${periodMonthName(period)}`, tone: "future" };
}

function RecurringPayForm({
  bill,
  amount,
  onClose,
  onSubmit
}: {
  bill: RecurringBill;
  amount: number;
  onClose: () => void;
  onSubmit: (method: PaymentMethod, proofFile: File | null) => Promise<void>;
}) {
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(method, proofFile);
      onClose();
    } catch {
      setError("No se pudo guardar. Intenta de nuevo.");
      setBusy(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Pago mensual</p>
            <h2>Pagar mi parte de {bill.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <p className="recurring-pay-amount">
          Tu parte de este mes: <strong>{money(amount)}</strong>
        </p>
        <div className="split-toolbar">
          <span>¿Cómo pagaste?</span>
          <div className="segmented">
            <button className={method === "transfer" ? "active" : ""} onClick={() => setMethod("transfer")} type="button">
              Transferencia
            </button>
            <button className={method === "cash" ? "active" : ""} onClick={() => setMethod("cash")} type="button">
              Efectivo
            </button>
            <button className={method === "other" ? "active" : ""} onClick={() => setMethod("other")} type="button">
              Otro
            </button>
          </div>
        </div>
        <PhotoPicker file={proofFile} onPick={setProofFile} label="Adjuntar comprobante (opcional)" />
        {error ? <div className="auth-alert error">{error}</div> : null}
        <button className="primary-action full" disabled={busy} onClick={submit} type="button">
          <Check size={19} />
          {busy ? "Guardando…" : "Marcar mi parte como pagada"}
        </button>
      </div>
    </ModalBackdrop>
  );
}

function RecurringBillForm({
  initial,
  onClose,
  onSubmit
}: {
  initial?: RecurringBill | null;
  onClose: () => void;
  onSubmit: (input: NewRecurringBillInput) => Promise<void>;
}) {
  const { people } = useApp();
  const isEdit = !!initial;
  const initialShares = initial ? Object.fromEntries(initial.shares.map((s) => [s.personId, s.amount])) : null;
  const initialTotal = initial ? initial.shares.reduce((sum, s) => sum + s.amount, 0) : 0;

  const [title, setTitle] = useState(initial?.title ?? "Renta");
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? 5));
  const [amount, setAmount] = useState(initial ? String(initialTotal) : "");
  const [splitMode, setSplitMode] = useState<SplitMode>(() => {
    if (!initial || !initial.shares.length) return "equal";
    const amts = initial.shares.map((s) => s.amount);
    return amts.every((a) => Math.abs(a - amts[0]) < 0.01) ? "equal" : "custom";
  });
  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(people.map((p) => [p.id, initialShares ? p.id in initialShares : true]))
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
  const customTotal = selectedPeople.reduce((sum, person) => sum + parseMoney(customAmounts[person.id] || "0"), 0);
  const customDifference = total - customTotal;
  const validCustom = splitMode === "equal" || Math.abs(customDifference) < 0.01;
  const dayNum = Math.min(28, Math.max(1, Math.round(Number(dueDay) || 1)));
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
      await onSubmit({ title: title.trim(), dueDay: dayNum, participants });
      onClose();
    } catch {
      setError("No se pudo guardar el pago mensual. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop>
      <form className="modal-sheet expense-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{isEdit ? "Editar" : "Nuevo pago mensual"}</p>
            <h2>{isEdit ? "Editar pago mensual" : "Agregar un pago mensual"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="form-grid two">
          <label>
            <span>¿Qué se paga?</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ej: Renta" />
          </label>
          <label>
            <span>Se paga antes del día</span>
            <input
              inputMode="numeric"
              type="number"
              min={1}
              max={28}
              value={dueDay}
              onChange={(event) => setDueDay(event.target.value)}
            />
          </label>
          <label>
            <span>Total mensual</span>
            <input inputMode="decimal" placeholder="0.00" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
        </div>

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
          <span>Quiénes pagan</span>
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

        {splitMode === "custom" ? (
          <div className={`difference-note ${validCustom ? "ok" : ""}`}>
            {validCustom
              ? "La división personalizada cuadra con el total."
              : `Faltan ${money(Math.abs(customDifference))} por cuadrar.`}
          </div>
        ) : null}

        <p className="difference-note ok" style={{ marginTop: 0 }}>
          Cada quien paga su parte por su cuenta. Les llegarán recordatorios antes del día {dayNum}.
        </p>

        {error ? <div className="auth-alert error">{error}</div> : null}

        <button className="primary-action full" disabled={!canSubmit || saving} type="submit">
          <Plus size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear pago mensual"}
        </button>
      </form>
    </ModalBackdrop>
  );
}

function RecurringBillCard({
  bill,
  onMarkPaid,
  onUnmark,
  onEdit,
  onDelete
}: {
  bill: RecurringBill;
  onMarkPaid: (bill: RecurringBill, amount: number, method: PaymentMethod, proofFile: File | null) => Promise<void>;
  onUnmark: (bill: RecurringBill) => Promise<void>;
  onEdit: (bill: RecurringBill) => void;
  onDelete: (bill: RecurringBill) => Promise<void>;
}) {
  const { people, getPerson, currentUserId } = useApp();
  const [showActions, setShowActions] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAdmin = getPerson(currentUserId).role === "admin";
  const canManage = bill.createdBy === currentUserId || isAdmin;

  const period = billActivePeriod(bill);
  const monthName = periodMonthName(period);
  const participants = bill.shares.filter((s) => people.some((p) => p.id === s.personId));
  const myShare = bill.shares.find((s) => s.personId === currentUserId);
  const paidThisPeriod = new Set(bill.payments.filter((p) => p.period === period).map((p) => p.personId));
  const paidCount = participants.filter((s) => paidThisPeriod.has(s.personId)).length;
  const iPaid = paidThisPeriod.has(currentUserId);
  const total = bill.shares.reduce((sum, s) => sum + s.amount, 0);
  const status = recurringDueStatus(period, bill.dueDay);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("No se pudo. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="recurring-card">
      <div className="recurring-top">
        <IconBubble icon={CalendarDays} tone="sky" />
        <div className="recurring-title">
          <strong>{bill.title}</strong>
          <span>{money(total)} al mes · día {bill.dueDay}</span>
        </div>
        {canManage ? (
          <button className="more-button" onClick={() => setShowActions(true)} type="button" aria-label="Opciones del pago">
            <MoreVertical size={18} />
          </button>
        ) : null}
      </div>

      {!iPaid ? <span className={`recurring-due-chip ${status.tone}`}>{status.label}</span> : null}

      <div className="recurring-people">
        {participants.map((s) => {
          const person = getPerson(s.personId);
          const done = paidThisPeriod.has(s.personId);
          return (
            <span className={`recurring-person ${done ? "paid" : ""}`} key={s.personId} title={`${person.shortName}: ${done ? "pagó" : "pendiente"}`}>
              <Avatar person={person} size="sm" />
              {done ? <Check size={13} className="recurring-person-check" /> : null}
            </span>
          );
        })}
        <small className="recurring-count">{paidCount}/{participants.length} pagaron · {monthName}</small>
      </div>

      {myShare ? (
        iPaid ? (
          <>
            <div className="recurring-paid-banner">
              <CheckCircle2 size={18} />
              Pagaste tu parte de {monthName} ({money(myShare.amount)})
            </div>
            <button className="undo-link" disabled={busy} onClick={() => run(() => onUnmark(bill))} type="button">
              <Undo2 size={15} />
              Deshacer mi pago
            </button>
          </>
        ) : (
          <button className="primary-action full" disabled={busy} onClick={() => setShowPay(true)} type="button">
            <HandCoins size={19} />
            Pagar mi parte ({money(myShare.amount)})
          </button>
        )
      ) : (
        <div className="recurring-paid-banner muted">No participas en este pago.</div>
      )}

      {error ? <div className="auth-alert error">{error}</div> : null}

      {showPay && myShare ? (
        <RecurringPayForm
          bill={bill}
          amount={myShare.amount}
          onClose={() => setShowPay(false)}
          onSubmit={(method, proofFile) => onMarkPaid(bill, myShare.amount, method, proofFile)}
        />
      ) : null}

      {showActions ? (
        <ItemActionsSheet
          eyebrow="Pago mensual"
          title={bill.title}
          onClose={() => setShowActions(false)}
          onEdit={() => {
            setShowActions(false);
            onEdit(bill);
          }}
          onDelete={() => onDelete(bill)}
        />
      ) : null}
    </article>
  );
}

function ExpensesView({
  currentUser,
  expenses,
  recurringBills,
  tab,
  setTab,
  onCreate,
  onOpenBalance,
  onCreateBill,
  onEditBill,
  onDeleteBill,
  onMarkBillPaid,
  onUnmarkBill,
  setActiveExpenseId
}: {
  currentUser: Person;
  expenses: Expense[];
  recurringBills: RecurringBill[];
  tab: "expenses" | "balances" | "monthly";
  setTab: (tab: "expenses" | "balances" | "monthly") => void;
  onCreate: (input: NewExpenseInput) => Promise<void>;
  onOpenBalance: (person: Person) => void;
  onCreateBill: (input: NewRecurringBillInput) => Promise<void>;
  onEditBill: (billId: string, input: NewRecurringBillInput) => Promise<void>;
  onDeleteBill: (bill: RecurringBill) => Promise<void>;
  onMarkBillPaid: (bill: RecurringBill, amount: number, method: PaymentMethod, proofFile: File | null) => Promise<void>;
  onUnmarkBill: (bill: RecurringBill) => Promise<void>;
  setActiveExpenseId: (id: string) => void;
}) {
  const { people, currentUserId } = useApp();
  const [showForm, setShowForm] = useState(false);
  const [showBillForm, setShowBillForm] = useState(false);
  const [editingBill, setEditingBill] = useState<RecurringBill | null>(null);
  const others = people.filter((p) => p.id !== currentUserId);
  // Punto en la subpestaña: tengo parte sin pagar del periodo activo y ya está
  // dentro de la ventana de aviso (faltan ≤7 días o ya venció).
  const iOweMonthly = recurringBills.some((bill) => {
    if (!bill.shares.some((s) => s.personId === currentUserId)) return false;
    const period = billActivePeriod(bill);
    const iPaid = bill.payments.some((p) => p.period === period && p.personId === currentUserId);
    if (iPaid) return false;
    const now = new Date();
    const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const daysLeft = Math.round((periodDueDate(period, bill.dueDay).getTime() - todayUtc) / 86_400_000);
    return daysLeft <= 7;
  });

  const myTotals = useMemo(() => {
    let owe = 0;
    let get = 0;
    for (const other of others) {
      const pair = pairwiseBalance(expenses, currentUserId, other.id);
      owe += pair.iOwe;
      get += pair.theyOwe;
    }
    return { owe, get };
  }, [expenses, others, currentUserId]);

  return (
    <section className="view-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Dinero compartido</p>
          <h1>Gastos y pagos</h1>
          <p>Lo que debes, lo que te deben y los pagos de cada mes.</p>
        </div>
        {tab === "expenses" ? (
          <button className="primary-action page-header-action" onClick={() => setShowForm(true)} type="button">
            <Plus size={19} />
            Agregar gasto
          </button>
        ) : tab === "monthly" ? (
          <button className="primary-action page-header-action" onClick={() => setShowBillForm(true)} type="button">
            <Plus size={19} />
            Agregar mensual
          </button>
        ) : null}
      </div>
      <div className="subtabs" aria-label="Secciones de gastos">
        <button className={tab === "expenses" ? "active" : ""} onClick={() => setTab("expenses")} type="button">
          Gastos <small>{expenses.length}</small>
        </button>
        <button className={tab === "balances" ? "active" : ""} onClick={() => setTab("balances")} type="button">
          Saldos
        </button>
        <button className={tab === "monthly" ? "active" : ""} onClick={() => setTab("monthly")} type="button">
          Mensual <small>{recurringBills.length}</small>
          {iOweMonthly ? <span className="subtab-dot" aria-hidden /> : null}
        </button>
      </div>

      {tab === "expenses" ? (
        <>
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
        </>
      ) : tab === "balances" ? (
        <>
          <div className="balance-summary">
            <div className="balance-summary-cell">
              <span>Debes en total</span>
              <strong className="coral-text">{money(myTotals.owe)}</strong>
            </div>
            <div className="balance-summary-divider" />
            <div className="balance-summary-cell">
              <span>Te deben</span>
              <strong className="mint-text">{money(myTotals.get)}</strong>
            </div>
          </div>

          {others.length ? (
            <div className="settle-list">
              {others.map((person) => {
                const pair = pairwiseBalance(expenses, currentUserId, person.id);
                const tone = pair.net > 0 ? "owe" : pair.net < 0 ? "get" : "even";
                const label = pair.net > 0 ? "Le debes" : pair.net < 0 ? "Te debe" : "A mano";
                return (
                  <button className="settle-row" key={person.id} onClick={() => onOpenBalance(person)} type="button">
                    <Avatar person={person} size="md" />
                    <span className="settle-row-main">
                      <strong>{person.name}</strong>
                      <small>{pair.net === 0 ? "Sin cuentas abiertas" : `${label} en neto`}</small>
                    </span>
                    <span className={`settle-amount ${tone}`}>
                      {pair.net === 0 ? "A mano" : money(Math.abs(pair.net))}
                    </span>
                    <ChevronRight size={19} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="empty-state">
              <Users size={28} />
              <strong>Aún están solos en la casa</strong>
              <span>Invita a tu familia desde “Personas”.</span>
            </div>
          )}
        </>
      ) : (
        <>
          {recurringBills.length ? (
            <div className="recurring-list">
              {recurringBills.map((bill) => (
                <RecurringBillCard
                  bill={bill}
                  key={bill.id}
                  onMarkPaid={onMarkBillPaid}
                  onUnmark={onUnmarkBill}
                  onEdit={setEditingBill}
                  onDelete={onDeleteBill}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <CalendarDays size={28} />
              <strong>Aún no hay pagos mensuales</strong>
              <span>Agrega la renta u otro pago fijo. Cada quien paga su parte y recibe recordatorios.</span>
            </div>
          )}
        </>
      )}

      {showForm ? (
        <ExpenseForm currentUser={currentUser} onClose={() => setShowForm(false)} onSubmit={onCreate} />
      ) : null}
      {showBillForm ? (
        <RecurringBillForm onClose={() => setShowBillForm(false)} onSubmit={onCreateBill} />
      ) : null}
      {editingBill ? (
        <RecurringBillForm
          initial={editingBill}
          onClose={() => setEditingBill(null)}
          onSubmit={(input) => onEditBill(editingBill.id, input)}
        />
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
  const [expanded, setExpanded] = useState(false);

  const isAdmin = getPerson(currentUserId).role === "admin";
  const Icon = rotationIcon(rotation.icon);
  const currentPerson = getPerson(rotation.queue[rotation.currentIndex]);
  const nextPerson = getPerson(rotation.queue[(rotation.currentIndex + 1) % rotation.queue.length]);
  const isMyTurn = rotation.queue[rotation.currentIndex] === currentUserId;
  const canMark = isMyTurn || isAdmin;
  const canUndo = (rotation.history[0]?.personId === currentUserId || isAdmin) && rotation.history.length > 0;

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
    <article className="rotation-card">
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
        {rotation.queue.length > 1 ? (
          <div className="rotation-next">
            <span>Después</span>
            <strong>{nextPerson.shortName}</strong>
          </div>
        ) : null}
      </div>

      {canMark ? (
        <button
          className="secondary-action full"
          disabled={busy}
          onClick={() => run(() => onComplete(rotation))}
          type="button"
        >
          <CheckCircle2 size={19} />
          {busy ? "Guardando…" : isMyTurn ? "Marcar hecho" : `Marcar hecho por ${currentPerson.shortName}`}
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
          {rotation.history[0]?.personId === currentUserId ? "Deshacer mi turno" : "Deshacer último turno"}
        </button>
      ) : null}

      {error ? <div className="auth-alert error">{error}</div> : null}

      <button
        className="rotation-details-toggle"
        onClick={() => setExpanded((current) => !current)}
        type="button"
        aria-expanded={expanded}
      >
        <span>Orden e historial</span>
        {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>

      {expanded ? (
        <div className="rotation-details">
          <div className="queue-strip" aria-label="Orden del turno">
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
          {rotation.history.length ? (
            <div className="history-list">
              {rotation.history.slice(0, 3).map((event) => (
                <div key={`${event.personId}-${event.completedAt}`}>
                  <span>{getPerson(event.personId).shortName}</span>
                  <small>{shortDate(event.completedAt.slice(0, 10))}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="rotation-no-history">Todavía no hay turnos completados.</p>
          )}
        </div>
      ) : null}

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
  const [hidden, setHidden] = useState(initial?.hiddenFromNonParticipants ?? false);
  const [order, setOrder] = useState<string[]>(() =>
    initial ? initial.queue.filter((id) => people.some((p) => p.id === id)) : people.map((p) => p.id)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = order
    .map((id) => people.find((p) => p.id === id))
    .filter((p): p is Person => !!p);
  const available = people.filter((p) => !order.includes(p.id));

  function move(index: number, dir: -1 | 1) {
    setOrder((cur) => {
      const j = index + dir;
      if (j < 0 || j >= cur.length) return cur;
      const next = cur.slice();
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  }
  const removeFromOrder = (id: string) => setOrder((cur) => cur.filter((x) => x !== id));
  const addToOrder = (id: string) => setOrder((cur) => (cur.includes(id) ? cur : [...cur, id]));

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
        hiddenFromNonParticipants: hidden,
        queue: chosen.map((p) => p.id)
      });
      onClose();
    } catch {
      setError("No se pudo guardar el turno. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop>
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
        <div className="order-block">
          <span className="order-title">Orden del turno</span>
          <div className="order-list">
            {chosen.map((person, index) => (
              <div className="order-row" key={person.id}>
                <span className="order-num">{index + 1}</span>
                <Avatar person={person} size="sm" />
                <span className="order-name">{person.name}</span>
                <div className="order-actions">
                  <button type="button" disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir">
                    <ChevronUp size={17} />
                  </button>
                  <button
                    type="button"
                    disabled={index === chosen.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label="Bajar"
                  >
                    <ChevronDown size={17} />
                  </button>
                  <button type="button" onClick={() => removeFromOrder(person.id)} aria-label="Quitar">
                    <X size={16} />
                  </button>
                </div>
              </div>
            ))}
            {chosen.length === 0 ? <p className="order-empty">Agrega al menos una persona.</p> : null}
          </div>
          {available.length ? (
            <div className="order-add">
              <span>Agregar:</span>
              {available.map((person) => (
                <button type="button" key={person.id} className="order-add-chip" onClick={() => addToOrder(person.id)}>
                  <Avatar person={person} size="sm" />
                  {person.shortName}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <label className={`privacy-option ${hidden ? "active" : ""}`}>
          <input checked={hidden} onChange={(event) => setHidden(event.target.checked)} type="checkbox" />
          <span>
            <strong>Ocultar a quienes no participan</strong>
            <small>Solo lo verán las personas del turno y el administrador.</small>
          </span>
        </label>
        <p className="difference-note ok" style={{ marginTop: 0 }}>
          {chosen.length
            ? `Empieza por ${chosen[0]?.name}. Después sigue el orden de la lista.`
            : "Elige el orden de la rotación."}
        </p>
        {error ? <div className="auth-alert error">{error}</div> : null}
        <button className="primary-action full" type="submit" disabled={!title.trim() || !chosen.length || saving}>
          <Plus size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Crear turno"}
        </button>
      </form>
    </ModalBackdrop>
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
      <div className="page-header">
        <div>
          <p className="eyebrow">Responsabilidades</p>
          <h1>Turnos</h1>
          <p>Ve a quién le toca ahora y marca cada tarea cuando esté lista.</p>
        </div>
        <button className="primary-action page-header-action" onClick={() => setShowForm(true)} type="button">
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
  defaultDay,
  initial,
  onClose,
  onSubmit
}: {
  currentUser: Person;
  defaultDay?: number;
  initial?: ScheduleSlot | null;
  onClose: () => void;
  onSubmit: (input: NewSlotInput) => Promise<void>;
}) {
  const { people } = useApp();
  const isEdit = !!initial;
  const [personId, setPersonId] = useState(initial?.personId ?? currentUser.id);
  const [day, setDay] = useState(String(initial?.day ?? defaultDay ?? 0));
  const [start, setStart] = useState(initial?.start ?? "18:00");
  const [end, setEnd] = useState(initial?.end ?? "20:00");
  const [label, setLabel] = useState(initial?.label ?? "Lavadora");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const validTime = start < end;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !validTime) return;
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
    <ModalBackdrop>
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
        {!validTime ? (
          <div className="difference-note">La hora de fin debe ser posterior a la hora de inicio.</div>
        ) : null}
        {error ? <div className="auth-alert error">{error}</div> : null}
        <button className="primary-action full" type="submit" disabled={saving || !validTime}>
          <Plus size={19} />
          {saving ? "Guardando…" : isEdit ? "Guardar cambios" : "Agregar horario"}
        </button>
      </form>
    </ModalBackdrop>
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
  const todayIndex = (new Date().getDay() + 6) % 7;
  const [selectedDay, setSelectedDay] = useState(todayIndex);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ScheduleSlot | null>(null);
  const [actionsSlot, setActionsSlot] = useState<ScheduleSlot | null>(null);
  const canManageSlot = (slot: ScheduleSlot) => currentUser.role === "admin" || slot.createdBy === currentUser.id;
  const selectedSlots = slots
    .filter((slot) => slot.day === selectedDay)
    .sort((a, b) => a.start.localeCompare(b.start));

  return (
    <section className="view-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">Esta semana</p>
          <h1>Horarios</h1>
          <p>Elige un día para ver quién tiene reservado cada horario.</p>
        </div>
        <button className="primary-action page-header-action" onClick={() => setShowForm(true)} type="button">
          <Plus size={19} />
          Agregar horario
        </button>
      </div>

      <div className="week-strip" role="tablist" aria-label="Días de la semana">
        {DAYS.map((day, dayIndex) => {
          const count = slots.filter((slot) => slot.day === dayIndex).length;
          const selected = selectedDay === dayIndex;
          return (
            <button
              className={`week-day-button ${selected ? "selected" : ""} ${todayIndex === dayIndex ? "today" : ""}`}
              key={day}
              onClick={() => setSelectedDay(dayIndex)}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={`${DAYS_FULL[dayIndex]}${count ? `, ${count} horarios` : ", libre"}`}
            >
              <span>{day}</span>
              <small>{count || "·"}</small>
            </button>
          );
        })}
      </div>

      <article className="day-agenda">
        <div className="day-agenda-head">
          <div>
            <p className="eyebrow">Día seleccionado</p>
            <h2>{DAYS_FULL[selectedDay]}</h2>
          </div>
          <span>{selectedSlots.length ? `${selectedSlots.length} ${selectedSlots.length === 1 ? "horario" : "horarios"}` : "Libre"}</span>
        </div>
        {selectedSlots.length ? (
          <div className="day-agenda-list">
            {selectedSlots.map((slot) => {
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
                  {canManage ? <ChevronRight size={19} /> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <button className="open-day" onClick={() => setShowForm(true)} type="button">
            <Plus size={20} />
            <span>
              <strong>No hay horarios</strong>
              <small>Agrega uno para {DAYS_FULL[selectedDay].toLowerCase()}.</small>
            </span>
          </button>
        )}
      </article>

      {showForm ? (
        <ScheduleForm
          currentUser={currentUser}
          defaultDay={selectedDay}
          onClose={() => setShowForm(false)}
          onSubmit={onCreate}
        />
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

function BalanceSheet({
  person,
  expenses,
  onClose,
  onSettle
}: {
  person: Person;
  expenses: Expense[];
  onClose: () => void;
  onSettle: (otherId: string, method: PaymentMethod, proofFile: File | null) => Promise<void>;
}) {
  const { currentUserId, getPerson } = useApp();
  const me = getPerson(currentUserId);
  const pair = useMemo(
    () => pairwiseBalance(expenses, currentUserId, person.id),
    [expenses, currentUserId, person.id]
  );
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasOpen = pair.iOweItems.length > 0 || pair.theyOweItems.length > 0;
  const net = pair.net;
  const iAmNetDebtor = net > 0;
  const settled = !hasOpen;
  const openCount = pair.iOweItems.length + pair.theyOweItems.length;
  const transferProofRequired = iAmNetDebtor && method === "transfer";
  const missingProof = transferProofRequired && !proofFile;
  async function settle() {
    if (missingProof) {
      setError("Sube el comprobante antes de saldar por transferencia.");
      return;
    }
    if (!confirming) {
      setError(null);
      setConfirming(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSettle(person.id, method, proofFile);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo saldar. Intenta de nuevo.");
      setBusy(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet balance-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Cuentas con</p>
            <h2>{person.name}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {settled ? (
          <div className="balance-net even">
            <Scale size={26} />
            <strong>Están a mano</strong>
            <span>No tienes cuentas abiertas con {person.shortName}.</span>
          </div>
        ) : (
          <>
            <div className={`balance-net ${net > 0 ? "owe" : net < 0 ? "get" : "even"}`}>
              <span className="balance-net-label">
                {net > 0
                  ? `En neto, le debes a ${person.shortName}`
                  : net < 0
                    ? `En neto, ${person.shortName} te debe`
                    : "Quedan a mano"}
              </span>
              <strong>{money(Math.abs(net))}</strong>
              {pair.iOwe > 0 && pair.theyOwe > 0 ? (
                <small>
                  {money(pair.iOwe)} que le debes − {money(pair.theyOwe)} que te debe se compensan.
                </small>
              ) : null}
            </div>

            {pair.iOweItems.length ? (
              <section className="balance-block">
                <div className="balance-block-head">
                  <strong>Tú le debes</strong>
                  <span>{money(pair.iOwe)}</span>
                </div>
                {pair.iOweItems.map((item) => (
                  <div className="balance-line" key={`owe-${item.expenseId}`}>
                    <span>{item.title}</span>
                    <strong>{money(item.amount)}</strong>
                  </div>
                ))}
              </section>
            ) : null}

            {pair.theyOweItems.length ? (
              <section className="balance-block">
                <div className="balance-block-head">
                  <strong>{person.shortName} te debe</strong>
                  <span className="mint">{money(pair.theyOwe)}</span>
                </div>
                {pair.theyOweItems.map((item) => (
                  <div className="balance-line" key={`get-${item.expenseId}`}>
                    <span>{item.title}</span>
                    <strong>{money(item.amount)}</strong>
                  </div>
                ))}
              </section>
            ) : null}

            <div className="payment-box">
              <div className="settle-explain">
                <Handshake size={19} />
                <span>
                  {net > 0
                    ? `Págale ${money(net)} a ${person.shortName} y quedan a mano.`
                    : net < 0
                      ? `Cuando ${person.shortName} te pague ${money(Math.abs(net))} quedan a mano.`
                      : "Marca todo como saldado: ya están a mano."}
                </span>
              </div>
              {iAmNetDebtor ? (
                <>
                  <div className="split-toolbar">
                    <span>Cómo pagaste</span>
                    <div className="segmented">
                      <button
                        className={method === "transfer" ? "active" : ""}
                        onClick={() => {
                          setMethod("transfer");
                          setConfirming(false);
                        }}
                        type="button"
                      >
                        Transferencia
                      </button>
                      <button
                        className={method === "cash" ? "active" : ""}
                        onClick={() => {
                          setMethod("cash");
                          setConfirming(false);
                        }}
                        type="button"
                      >
                        Efectivo
                      </button>
                    </div>
                  </div>
                  {method !== "cash" ? (
                    <PhotoPicker
                      file={proofFile}
                      onPick={(f) => {
                        setProofFile(f);
                        setConfirming(false);
                      }}
                      label="Subir comprobante (obligatorio)"
                      icon={Upload}
                    />
                  ) : null}
                </>
              ) : null}
              {missingProof ? (
                <div className="settle-warning">
                  <Upload size={18} />
                  <span>Para transferencia, NestLoop necesita una captura antes de cerrar estas cuentas.</span>
                </div>
              ) : null}
              {confirming ? (
                <div className="settle-confirm-box">
                  <ShieldCheck size={19} />
                  <div>
                    <strong>Revisa antes de saldar</strong>
                    <span>
                      Se cerrarán {openCount} {openCount === 1 ? "cuenta" : "cuentas"} entre {me.shortName} y{" "}
                      {person.shortName}. Si fue un error, podrás deshacerlo desde el historial.
                    </span>
                  </div>
                  <button className="ghost-action full" onClick={() => setConfirming(false)} type="button">
                    Volver a revisar
                  </button>
                </div>
              ) : null}
              {error ? <div className="auth-alert error">{error}</div> : null}
              <button className="primary-action full" disabled={busy || missingProof} onClick={settle} type="button">
                <Handshake size={19} />
                {busy
                  ? "Saldando…"
                  : !confirming
                    ? "Revisar antes de saldar"
                    : net > 0
                    ? `Saldar: le pagué ${money(net)}`
                    : net < 0
                      ? `Saldar: ${person.shortName} me pagó ${money(Math.abs(net))}`
                      : "Marcar como saldado"}
              </button>
            </div>
          </>
        )}
        <p className="form-hint" style={{ textAlign: "center" }}>
          Al saldar, todas las cuentas abiertas entre {me.shortName} y {person.shortName} quedan
          confirmadas y se guardan en el historial.
        </p>
      </div>
    </ModalBackdrop>
  );
}

function PeopleView({
  rotations,
  household
}: {
  rotations: Rotation[];
  household: Household;
}) {
  const { people, currentUserId } = useApp();
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
    <section className="view-stack">
      <div className="page-header">
        <div>
          <p className="eyebrow">La casa</p>
          <h1>Personas</h1>
          <p>{people.length} {people.length === 1 ? "persona forma" : "personas forman"} parte de {household.name}.</p>
        </div>
      </div>

      <div className="member-chips">
        {people.map((person) => {
          const nextTurn = rotations.find((rotation) => rotation.queue[rotation.currentIndex] === person.id);
          return (
            <div className="member-chip" key={person.id}>
              <Avatar person={person} size="sm" />
              <span>
                <strong>{person.name}{person.id === currentUserId ? " (tú)" : ""}</strong>
                <small>
                  {person.role === "admin" ? "Administrador" : "Miembro"}
                  {nextTurn ? ` · ${nextTurn.title}` : ""}
                </small>
              </span>
            </div>
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
    <ModalBackdrop onClose={onClose}>
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
    </ModalBackdrop>
  );
}

type HistoryEvent = {
  id: string;
  at: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  detail: string;
  amount?: number;
  bucket?: "receipts" | "payment-proofs";
  path?: string;
  settlement?: Settlement;
};

function buildHistory(expenses: Expense[], settlements: Settlement[], getPerson: (id: string) => Person): HistoryEvent[] {
  const events: HistoryEvent[] = [];

  for (const expense of expenses) {
    events.push({
      id: `exp-${expense.id}`,
      at: expense.createdAt,
      icon: ReceiptText,
      tone: "coral",
      title: `${getPerson(expense.createdBy).shortName} agregó "${expense.title}"`,
      detail: `${expense.merchant || "Sin tienda"} · dividido entre ${expense.shares.length}`,
      amount: expense.amount,
      bucket: expense.receiptPath ? "receipts" : undefined,
      path: expense.receiptPath
    });
    for (const share of expense.shares) {
      if (share.personId === expense.paidBy) continue;
      if (share.status === "confirmed" && share.confirmedAt) {
        events.push({
          id: `pay-${expense.id}-${share.personId}`,
          at: share.confirmedAt,
          icon: BadgeCheck,
          tone: "mint",
          title: `${getPerson(share.personId).shortName} pagó a ${getPerson(expense.paidBy).shortName}`,
          detail: `"${expense.title}" · ${methodLabel(share.paymentMethod) ?? "saldado"}`,
          amount: share.amount,
          bucket: share.proofPath ? "payment-proofs" : undefined,
          path: share.proofPath
        });
      }
    }
  }

  for (const s of settlements) {
    const reversed = !!s.reversedAt;
    events.push({
      id: `set-${s.id}`,
      at: s.reversedAt ?? s.createdAt,
      icon: reversed ? RotateCcw : Handshake,
      tone: reversed ? "coral" : "sky",
      title: `${getPerson(s.fromProfile).shortName} saldó con ${getPerson(s.toProfile).shortName}`,
      detail:
        s.grossOwed > 0 && s.grossOwing > 0
          ? `Se compensaron las cuentas · ${s.sharesCleared} cerradas`
          : `${s.sharesCleared} ${s.sharesCleared === 1 ? "cuenta cerrada" : "cuentas cerradas"}`,
      amount: s.netAmount,
      bucket: s.proofPath ? "payment-proofs" : undefined,
      path: s.proofPath,
      settlement: s
    });
  }

  return events.sort((a, b) => (a.at < b.at ? 1 : -1));
}

function HistorySheet({
  householdId,
  onClose,
  onUndoSettlement
}: {
  householdId: string;
  onClose: () => void;
  onUndoSettlement: (settlementId: string) => Promise<void>;
}) {
  const { getPerson } = useApp();
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState(false);
  const [confirmUndoId, setConfirmUndoId] = useState<string | null>(null);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ bucket: "receipts" | "payment-proofs"; path: string; title: string } | null>(null);

  useEffect(() => {
    let on = true;
    Promise.all([fetchExpenses(householdId, true), fetchSettlements(householdId)])
      .then(([expenses, settlements]) => {
        if (on) setEvents(buildHistory(expenses, settlements, getPerson));
      })
      .catch(() => {
        if (on) setError(true);
      });
    return () => {
      on = false;
    };
  }, [householdId, getPerson]);

  async function refreshHistory() {
    setError(false);
    setEvents(null);
    const [expenses, settlements] = await Promise.all([fetchExpenses(householdId, true), fetchSettlements(householdId)]);
    setEvents(buildHistory(expenses, settlements, getPerson));
  }

  async function handleUndoSettlement(settlementId: string) {
    if (confirmUndoId !== settlementId) {
      setConfirmUndoId(settlementId);
      return;
    }
    setUndoingId(settlementId);
    setError(false);
    try {
      await onUndoSettlement(settlementId);
      setConfirmUndoId(null);
      await refreshHistory();
    } catch {
      setError(true);
    } finally {
      setUndoingId(null);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet history-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Movimientos</p>
            <h2>Historial de la casa</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        {!events && !error ? (
          <div className="empty-state">
            <span className="loading-mark small">
              <RotateCw size={22} />
            </span>
            <strong>Cargando…</strong>
          </div>
        ) : error ? (
          <div className="empty-state">
            <Database size={28} />
            <strong>No se pudo cargar</strong>
          </div>
        ) : events && events.length ? (
          <div className="history-list">
            {events.map((event) => {
              const Icon = event.icon;
              const clickable = !!(event.bucket && event.path);
              const settlement = event.settlement;
              const reversed = !!settlement?.reversedAt;
              const canUndo = !!settlement && !reversed;
              const isConfirmingUndo = confirmUndoId === settlement?.id;
              const isUndoing = undoingId === settlement?.id;
              return (
                <div
                  className={`history-row ${clickable ? "clickable" : ""}`}
                  key={event.id}
                  onClick={
                    clickable
                      ? () => setViewing({ bucket: event.bucket!, path: event.path!, title: event.title })
                      : undefined
                  }
                >
                  <IconBubble icon={Icon} tone={event.tone} />
                  <span className="history-main">
                    <strong>{reversed ? "Saldo deshecho" : event.title}</strong>
                    <small>
                      {reversed
                        ? `${settlement?.sharesCleared ?? 0} ${
                            settlement?.sharesCleared === 1 ? "cuenta restaurada" : "cuentas restauradas"
                          }`
                        : event.detail}
                    </small>
                    {isConfirmingUndo ? <em>Toca Confirmar para volver a abrir esas cuentas.</em> : null}
                    <em>{relativeDate(event.at)}</em>
                  </span>
                  <span className="history-side">
                    {event.amount !== undefined ? <strong>{money(event.amount)}</strong> : null}
                    {clickable ? <Camera size={15} /> : null}
                    {canUndo ? (
                      <button
                        className={`undo-link ${isConfirmingUndo ? "confirming" : ""}`}
                        disabled={isUndoing}
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleUndoSettlement(settlement.id);
                        }}
                        type="button"
                      >
                        {isUndoing ? "Deshaciendo..." : isConfirmingUndo ? "Confirmar" : "Deshacer"}
                      </button>
                    ) : reversed ? (
                      <small className="history-tag">Deshecho</small>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-state">
            <History size={28} />
            <strong>Todavía no hay movimientos</strong>
            <span>Aquí aparecerá cada gasto, pago y cuenta saldada.</span>
          </div>
        )}
      </div>

      {viewing ? (
        <ModalBackdrop onClose={() => setViewing(null)}>
          <div className="modal-sheet photo-sheet">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Comprobante</p>
                <h2>{viewing.title}</h2>
              </div>
              <button className="icon-button" onClick={() => setViewing(null)} type="button" aria-label="Cerrar">
                <X size={20} />
              </button>
            </div>
            <ZoomableImage bucket={viewing.bucket} path={viewing.path} alt="Comprobante" />
          </div>
        </ModalBackdrop>
      ) : null}
    </ModalBackdrop>
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
  const [expensesTab, setExpensesTab] = useState<"expenses" | "balances" | "monthly">("expenses");
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recurringBills, setRecurringBills] = useState<RecurringBill[]>([]);
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [activeExpenseId, setActiveExpenseId] = useState<string | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [balancePerson, setBalancePerson] = useState<Person | null>(null);
  const [notifications, setNotifications] = useState<NotificationDelivery[]>([]);
  const [seenNotificationIds, setSeenNotificationIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | PushRegistrationResult
  >("unsupported");

  const hid = household.id;

  const reloadExpenses = useCallback(async () => {
    setExpenses(await fetchExpenses(hid));
  }, [hid]);
  const reloadRecurringBills = useCallback(async () => {
    setRecurringBills(await fetchRecurringBills(hid));
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

  // Recarga silenciosa de todo (sin spinner): para refresco en vivo.
  const reloadAll = useCallback(async () => {
    try {
      const [e, b, r, s, n] = await Promise.all([
        fetchExpenses(hid),
        fetchRecurringBills(hid),
        fetchRotations(hid),
        fetchSlots(hid),
        fetchNotifications(hid)
      ]);
      setExpenses(e);
      setRecurringBills(b);
      setRotations(r);
      setSlots(s);
      setNotifications(n);
    } catch {
      /* error transitorio de red: lo intenta de nuevo en el próximo ciclo */
    }
  }, [hid]);

  useEffect(() => {
    let on = true;
    setLoading(true);
    setLoadError(false);
    Promise.all([
      fetchExpenses(hid),
      fetchRecurringBills(hid),
      fetchRotations(hid),
      fetchSlots(hid),
      fetchNotifications(hid)
    ])
      .then(([e, b, r, s, n]) => {
        if (!on) return;
        setExpenses(e);
        setRecurringBills(b);
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
  }, [hid, loadAttempt]);

  // Actualización en vivo: refresca mientras la app está abierta (cada 12s)
  // y al instante cuando vuelves a la app (cambio de pestaña / volver al frente).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const tick = () => {
      if (document.visibilityState === "visible") void reloadAll();
    };
    const interval = window.setInterval(tick, 12_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadAll();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reloadAll]);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationPermission(Notification.permission);
  }, []);

  // Auto-reparación del push: en Android/Chrome el canal caduca con el tiempo
  // y el teléfono deja de recibir avisos sin que nadie se entere. Al abrir la
  // app (con permiso ya concedido) verificamos el canal y lo renovamos si hace
  // falta, sin molestar al usuario.
  useEffect(() => {
    ensurePushSubscription(hid).catch(() => {
      /* sin conexión o sin permiso: se reintenta en la próxima apertura */
    });
  }, [hid]);

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
      setExpensesTab("expenses");
      setActiveView("expenses");
    } else if (notification.kind === "recurring_due") {
      setExpensesTab("monthly");
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

  async function handleSettleWith(otherId: string, method: PaymentMethod, proofFile: File | null) {
    await apiSettleWith(hid, otherId, method, proofFile);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }

  async function handleUndoSettlement(settlementId: string) {
    await apiUndoSettlement(settlementId);
    await reloadExpenses();
    await reloadNotifications().catch(() => {});
  }

  // Pagos mensuales en conjunto (renta, etc.)
  async function handleCreateRecurringBill(input: NewRecurringBillInput) {
    await apiCreateRecurringBill(hid, currentUserId, input);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUpdateRecurringBill(billId: string, input: NewRecurringBillInput) {
    await apiUpdateRecurringBill(billId, input);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleDeleteRecurringBill(bill: RecurringBill) {
    await apiDeleteRecurringBill(bill.id);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
  }
  async function handleMarkRecurringPaid(
    bill: RecurringBill,
    amount: number,
    method: PaymentMethod,
    proofFile: File | null
  ) {
    await apiMarkRecurringPaid(hid, bill.id, currentUserId, billActivePeriod(bill), amount, method, proofFile);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
    void triggerPushDispatch();
  }
  async function handleUnmarkRecurringPaid(bill: RecurringBill) {
    const period = lastPaidPeriod(bill, currentUserId);
    if (!period) return;
    await apiUnmarkRecurringPaid(bill.id, currentUserId, period);
    await reloadRecurringBills();
    await reloadNotifications().catch(() => {});
  }

  return (
    <AppDataContext.Provider value={appData}>
      <main className="app-shell">
        <AppNav activeView={activeView} setActiveView={setActiveView} />
        <div className="app-main">
          <TopBar
            activeView={activeView}
            currentUser={currentUser}
            household={household}
            notificationPermission={notificationPermission}
            onNotificationsClick={handleNotificationsClick}
            onProfileClick={() => setShowProfile(true)}
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
              <span>Revisa tu conexión e inténtalo otra vez.</span>
              <button className="secondary-action" onClick={() => setLoadAttempt((attempt) => attempt + 1)} type="button">
                <RotateCw size={18} />
                Reintentar
              </button>
            </div>
          ) : (
            <>
              {activeView === "home" ? (
                <HomeView
                  currentUser={currentUser}
                  expenses={expenses}
                  rotations={rotations}
                  recurringBills={recurringBills}
                  setActiveExpenseId={setActiveExpenseId}
                  setActiveView={setActiveView}
                  onOpenMonthly={() => {
                    setExpensesTab("monthly");
                    setActiveView("expenses");
                  }}
                />
              ) : null}

              {activeView === "expenses" ? (
                <ExpensesView
                  currentUser={currentUser}
                  expenses={expenses}
                  recurringBills={recurringBills}
                  tab={expensesTab}
                  setTab={setExpensesTab}
                  onCreate={handleCreateExpense}
                  onOpenBalance={setBalancePerson}
                  onCreateBill={handleCreateRecurringBill}
                  onEditBill={handleUpdateRecurringBill}
                  onDeleteBill={handleDeleteRecurringBill}
                  onMarkBillPaid={handleMarkRecurringPaid}
                  onUnmarkBill={handleUnmarkRecurringPaid}
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
                <PeopleView household={household} rotations={rotations} />
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
        {showProfile ? (
          <ProfileSheet
            currentUser={currentUser}
            household={household}
            notificationPermission={notificationPermission}
            onEnableNotifications={handleEnableNotifications}
            onHelp={() => {
              setShowProfile(false);
              setShowHelp(true);
            }}
            onHistory={() => {
              setShowProfile(false);
              setShowHistory(true);
            }}
            onSignOut={onSignOut}
            onClose={() => setShowProfile(false)}
          />
        ) : null}
        {showNotifications ? (
          <NotificationsSheet
            notifications={notifications}
            onClose={() => setShowNotifications(false)}
            onMarkSeen={handleMarkNotificationsSeen}
            onSelect={handleSelectNotification}
            unreadIds={unreadNotificationIds}
          />
        ) : null}
        {balancePerson ? (
          <BalanceSheet
            expenses={expenses}
            onClose={() => setBalancePerson(null)}
            onSettle={handleSettleWith}
            person={balancePerson}
          />
        ) : null}
        {showHistory ? (
          <HistorySheet
            householdId={hid}
            onClose={() => setShowHistory(false)}
            onUndoSettlement={handleUndoSettlement}
          />
        ) : null}
      </main>
    </AppDataContext.Provider>
  );
}
