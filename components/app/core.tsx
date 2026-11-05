"use client";

import {
  Camera,
  Droplets,
  Image as ImageIcon,
  LucideIcon,
  Pencil,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  X
} from "lucide-react";
import {
  createContext,
  CSSProperties,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { Person } from "../../lib/household";
import { dismissModalKeyboard, useModalNavigation } from "../useModalNavigation";
import {
  signedUrl,
  type Expense,
  type NotificationDelivery,
  type PaymentMethod,
  type RotationIcon
} from "../../lib/api";

export const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const DAYS_FULL = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
export const CATEGORIES = ["Comida", "Agua", "Casa", "Limpieza", "Reembolso", "Otro"];

// ---------------------------------------------------------------------------
// Contexto de datos de la casa (personas reales + usuario actual)
// ---------------------------------------------------------------------------
export type AppData = {
  people: Person[];
  getPerson: (id: string) => Person;
  currentUserId: string;
};

export const AppDataContext = createContext<AppData | null>(null);

export function useApp(): AppData {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useApp debe usarse dentro de NestLoopApp");
  return ctx;
}

export const PLACEHOLDER: Person = {
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
export const moneyFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function money(value: number) {
  return moneyFormatter.format(value);
}

export function shortDate(value: string) {
  return new Intl.DateTimeFormat("es", { month: "short", day: "numeric" }).format(
    new Date(`${value}T12:00:00`)
  );
}

export function relativeTime(value?: string | null) {
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

export function notificationStorageKey(householdId: string, userId: string) {
  return `nestloop:seen-notifications:${householdId}:${userId}`;
}

export function notificationKindLabel(kind: NotificationDelivery["kind"]) {
  if (kind === "expense_due") return "Pago pendiente";
  if (kind === "payment_confirmation") return "Por confirmar";
  if (kind === "task_turn") return "Turno";
  if (kind === "recurring_due") return "Pago mensual";
  return "Horario";
}

export function relativeDate(value: string) {
  return new Intl.DateTimeFormat("es", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function cents(value: number) {
  return Math.round(value * 100);
}
export function fromCents(value: number) {
  return value / 100;
}
export function parseMoney(value: string) {
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
export function splitEvenly(total: number, count: number) {
  const totalCents = cents(total);
  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;
  return Array.from({ length: count }, (_, index) => fromCents(base + (index < remainder ? 1 : 0)));
}

export function methodLabel(method?: PaymentMethod) {
  if (method === "transfer") return "Transferencia";
  if (method === "cash") return "Efectivo";
  if (method === "other") return "Otro";
  return undefined;
}

export type PairItem = { expenseId: string; title: string; amount: number };
export type Pairwise = {
  iOweItems: PairItem[];
  theyOweItems: PairItem[];
  iOwe: number;
  theyOwe: number;
  net: number; // >0 yo le debo a la otra persona; <0 me debe; 0 a mano
};

/** Cuentas abiertas entre el usuario actual (meId) y otra persona (otherId). */
export function pairwiseBalance(expenses: Expense[], meId: string, otherId: string): Pairwise {
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

export type BodyLockSnapshot = {
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
export function useBodyScrollLock() {
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
export function ModalBackdrop({
  children,
  onClose,
  onBack
}: {
  children: React.ReactNode;
  onClose?: () => void;
  onBack?: () => void;
}) {
  useBodyScrollLock();
  useModalNavigation(onBack ?? onClose);
  const backdropPress = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onPointerDown={(event) => {
        backdropPress.current = null;
        if (event.target !== event.currentTarget || !onClose) return;
        if (dismissModalKeyboard()) {
          event.preventDefault();
          return;
        }
        backdropPress.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={(event) => {
        const press = backdropPress.current;
        backdropPress.current = null;
        if (event.target !== event.currentTarget || !press || !onClose) return;
        if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 10) return;
        if (!dismissModalKeyboard()) onClose();
      }}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Piezas visuales reutilizables
// ---------------------------------------------------------------------------
export function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" | "lg" }) {
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

export function IconBubble({ icon: Icon, tone }: { icon: LucideIcon; tone: string }) {
  return (
    <span className={`icon-bubble tone-${tone}`}>
      <Icon size={20} strokeWidth={2.4} />
    </span>
  );
}

export function rotationIcon(icon: RotationIcon) {
  if (icon === "water") return Droplets;
  if (icon === "trash") return RotateCcw;
  return Sparkles;
}

/** Muestra una imagen de un bucket privado usando una URL firmada. */
export function SignedImage({
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
export function ZoomableImage({
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

export function CameraCaptureSheet({
  onCapture,
  onChooseGallery,
  onClose
}: {
  onCapture: (file: File) => void;
  onChooseGallery: () => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraState, setCameraState] = useState<"loading" | "ready" | "error">("loading");
  const [cameraError, setCameraError] = useState("");
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    let active = true;

    async function openCamera() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError("Este navegador no puede abrir la cámara aquí. Elige la foto desde Galería.");
        setCameraState("error");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1920 },
            height: { ideal: 1440 }
          }
        });

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraState("ready");
      } catch (caught) {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        const name = caught instanceof DOMException ? caught.name : "";
        setCameraError(
          name === "NotAllowedError"
            ? "NestLoop necesita permiso para usar la cámara. Actívalo o elige la foto desde Galería."
            : name === "NotFoundError"
              ? "No encontramos una cámara disponible. Elige la foto desde Galería."
              : "No pudimos abrir la cámara. Cierra otras apps que la estén usando e inténtalo de nuevo."
        );
        setCameraState("error");
      }
    }

    void openCamera();
    return () => {
      active = false;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || capturing) return;

    setCapturing(true);
    setCameraError("");
    try {
      const maxSide = 2560;
      const scale = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("No se pudo preparar la foto.");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (result) => (result ? resolve(result) : reject(new Error("No se pudo guardar la foto."))),
          "image/jpeg",
          0.9
        );
      });

      onCapture(new File([blob], `nestloop-${Date.now()}.jpg`, { type: "image/jpeg" }));
      onClose();
    } catch (caught) {
      setCameraError(caught instanceof Error ? caught.message : "No se pudo tomar la foto.");
      setCameraState("error");
    } finally {
      setCapturing(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet camera-sheet" role="dialog" aria-modal="true" aria-labelledby="camera-title">
        <div className="modal-header camera-header">
          <div>
            <p className="eyebrow">Comprobante</p>
            <h2 id="camera-title">Tomar foto</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar cámara">
            <X size={20} />
          </button>
        </div>

        <div className="camera-stage">
          <video ref={videoRef} className="camera-video" autoPlay muted playsInline aria-label="Vista de la cámara" />
          {cameraState === "loading" ? (
            <div className="camera-message" role="status">
              <span className="camera-spinner" aria-hidden="true">
                <RotateCw size={25} />
              </span>
              <strong>Abriendo cámara…</strong>
            </div>
          ) : null}
          {cameraState === "error" ? (
            <div className="camera-message camera-message-error" role="alert">
              <Camera size={27} />
              <strong>No se pudo abrir</strong>
              <span>{cameraError}</span>
            </div>
          ) : null}
        </div>

        <p className="camera-help">Asegúrate de que el comprobante completo quede dentro de la imagen.</p>
        <button
          className="primary-action full camera-capture"
          disabled={cameraState !== "ready" || capturing}
          onClick={() => void takePhoto()}
          type="button"
        >
          <Camera size={20} />
          {capturing ? "Guardando…" : "Tomar foto"}
        </button>
        {cameraState === "error" ? (
          <button className="secondary-action full" onClick={onChooseGallery} type="button">
            Elegir desde Galería
          </button>
        ) : null}
      </div>
    </ModalBackdrop>
  );
}

/** Selector de foto con cámara integrada y acceso a la galería. */
export function PhotoPicker({
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
  const galleryRef = useRef<HTMLInputElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);

  function clearPhoto() {
    if (galleryRef.current) galleryRef.current.value = "";
    onPick(null);
  }

  return (
    <div className="photo-picker">
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
        <button type="button" onClick={() => setCameraOpen(true)}>
          <Camera size={17} />
          Cámara
        </button>
        <button type="button" onClick={() => galleryRef.current?.click()}>
          <ImageIcon size={17} />
          Galería
        </button>
      </div>
      {cameraOpen ? (
        <CameraCaptureSheet
          onCapture={(capturedFile) => onPick(capturedFile)}
          onChooseGallery={() => {
            setCameraOpen(false);
            galleryRef.current?.click();
          }}
          onClose={() => setCameraOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Hoja de acciones (Editar / Eliminar) con confirmación de borrado. */
export function ItemActionsSheet({
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