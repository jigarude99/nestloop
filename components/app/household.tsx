"use client";

import {
  BadgeCheck,
  BellRing,
  CalendarDays,
  Camera,
  CheckCircle2,
  CreditCard,
  Database,
  Handshake,
  HelpCircle,
  History,
  KeyRound,
  LifeBuoy,
  LogOut,
  LucideIcon,
  ReceiptText,
  RotateCcw,
  RotateCw,
  ShieldCheck,
  Users,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { hasSupabaseConfig } from "../../lib/supabase";
import { Household, Person } from "../../lib/household";
import {
  fetchExpenses,
  fetchSettlements,
  type Expense,
  type NotificationDelivery,
  type PushRegistrationResult,
  type Rotation,
  type Settlement
} from "../../lib/api";
import {
  Avatar,
  IconBubble,
  ModalBackdrop,
  ZoomableImage,
  methodLabel,
  money,
  notificationKindLabel,
  relativeDate,
  relativeTime,
  useApp
} from "./core";
import { ReceiptStamp } from "./expenses";

/** Hoja de perfil: tu cuenta, la casa, el código de invitación, ayuda y salir. */
export function ProfileSheet({
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

export function NotificationsSheet({
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

export function PeopleView({
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
      <header className="view-header">
        <div>
          <h1>Personas</h1>
          <p className="view-sub">{people.length} {people.length === 1 ? "persona" : "personas"} en {household.name}</p>
        </div>
      </header>

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

export function HelpSheet({ household, onClose }: { household: Household; onClose: () => void }) {
  const steps: { icon: LucideIcon; tone: string; title: string; body: string }[] = [
    {
      icon: ReceiptText,
      tone: "coral",
      title: "Agregar un gasto",
      body: "Toca “Nuevo gasto”, pon el total, elige quién pagó y entre quiénes se divide. Puedes adjuntar la foto de la factura."
    },
    {
      icon: CreditCard,
      tone: "sun",
      title: "Pagar lo que debes",
      body: "Abre la factura en “Te toca pagar” y márcala como pagada. Si fue transferencia, sube la captura. Si fue en efectivo, queda esperando que confirmen."
    },
    {
      icon: ShieldCheck,
      tone: "mint",
      title: "Confirmar un pago en efectivo",
      body: "Cuando alguien te paga en efectivo, la factura aparece en “Confirma estos pagos”. Tú tocas “Aceptar” (o “Rechazar” si hay un error)."
    },
    {
      icon: RotateCw,
      tone: "sky",
      title: "Turnos (como el agua)",
      body: "En “Turnos” creas la lista. Cuando te toca, tocas “Hecho” y le pasa al siguiente. Si le diste sin querer, usa “Deshacer”."
    },
    {
      icon: CalendarDays,
      tone: "violet",
      title: "Agenda",
      body: "Muestra lo que pasa cada día de la semana: pagos que vencen, turnos y reservas. Con “Reservar” apartas la lavadora, la cocina o el carro en los días que quieras."
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
        <div className="help-legend">
          <strong>Los colores de las facturas</strong>
          {(
            [
              ["pay", "Te toca pagar"],
              ["review", "Falta confirmar un pago en efectivo"],
              ["paid", "Ya pagaste, pero falta gente"],
              ["done", "Completa: todos pagaron"],
              ["other", "No participas"]
            ] as const
          ).map(([tone, text]) => (
            <div key={tone}>
              <ReceiptStamp tone={tone} />
              <span>{text}</span>
            </div>
          ))}
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

export type HistoryEvent = {
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

export function buildHistory(expenses: Expense[], settlements: Settlement[], getPerson: (id: string) => Person): HistoryEvent[] {
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

export function HistorySheet({
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
