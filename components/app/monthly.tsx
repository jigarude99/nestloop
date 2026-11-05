"use client";

import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  Coins,
  HandCoins,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Undo2,
  X
} from "lucide-react";
import { FormEvent, useState } from "react";
import { namesList, scaleShares } from "../../lib/expense-status";
import {
  billDisplayPeriod,
  firstUnpaidPeriod,
  lastPaidPeriod,
  periodDueDate,
  periodMonthName,
  type NewRecurringBillInput,
  type PaymentMethod,
  type RecurringBill
} from "../../lib/api";
import {
  Avatar,
  ItemActionsSheet,
  ModalBackdrop,
  PhotoPicker,
  ZoomableImage,
  methodLabel,
  money,
  parseMoney,
  splitEvenly,
  useApp
} from "./core";

type SplitMode = "equal" | "custom";

function daysUntil(period: string, dueDay: number) {
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((periodDueDate(period, dueDay).getTime() - todayUtc) / 86_400_000);
}

/** Estado del vencimiento del periodo activo. */
export function recurringDueStatus(period: string, dueDay: number) {
  const daysLeft = daysUntil(period, dueDay);
  const day = Math.min(dueDay, 28);
  const tone: "overdue" | "today" | "soon" | "future" =
    daysLeft < 0 ? "overdue" : daysLeft <= 1 ? "today" : daysLeft <= 7 ? "soon" : "future";
  const label =
    daysLeft < 0
      ? `Vencida hace ${-daysLeft} día${daysLeft === -1 ? "" : "s"}`
      : daysLeft === 0
        ? "Vence hoy"
        : daysLeft === 1
          ? "Vence mañana"
          : daysLeft <= 7
            ? `Vence en ${daysLeft} días`
            : `Vence el ${day} de ${periodMonthName(period)}`;
  return { daysLeft, label, tone };
}

/** Tengo parte sin pagar y ya está dentro de la ventana de aviso (≤7 días o vencida). */
export function monthlyIsDue(bill: RecurringBill, meId: string) {
  if (!bill.shares.some((share) => share.personId === meId && share.amount > 0)) return false;
  return daysUntil(firstUnpaidPeriod(bill, meId), bill.dueDay) <= 7;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function periodLabel(period: string) {
  return `${capitalize(periodMonthName(period))} ${period.slice(0, 4)}`;
}

function useBillFacts(bill: RecurringBill) {
  const { people, getPerson, currentUserId } = useApp();
  const period = billDisplayPeriod(bill);
  const participants = bill.shares.filter((share) => people.some((person) => person.id === share.personId));
  const myShare = bill.shares.find((share) => share.personId === currentUserId);
  const payments = bill.payments.filter((payment) => payment.period === period);
  const paidIds = new Set(payments.map((payment) => payment.personId));
  const missing = participants.filter((share) => !paidIds.has(share.personId));
  const missingOthers = missing.filter((share) => share.personId !== currentUserId);
  const othersNames = namesList(missingOthers.map((share) => getPerson(share.personId).shortName));
  const iMiss = missing.length !== missingOthers.length;
  const lateFrom = (personId: string) => {
    const first = firstUnpaidPeriod(bill, personId);
    return first < period ? first : null;
  };
  const late = participants.filter((share) => share.personId !== currentUserId && lateFrom(share.personId));
  const myPeriod = firstUnpaidPeriod(bill, currentUserId);
  return {
    period,
    monthName: periodMonthName(period),
    participants,
    myShare,
    payments,
    missing,
    paidCount: participants.length - missing.length,
    total: bill.shares.reduce((sum, share) => sum + share.amount, 0),
    status: recurringDueStatus(period, bill.dueDay),
    missingLine: !missing.length
      ? null
      : !missingOthers.length
        ? "Solo faltas tú"
        : `${iMiss ? "También faltan" : "Faltan"} ${othersNames}`,
    lateLine: late.length
      ? `Con meses atrasados: ${namesList(late.map((share) => getPerson(share.personId).shortName))}`
      : null,
    lateFrom,
    myPeriod,
    myMonthName: periodMonthName(myPeriod),
    myStatus: recurringDueStatus(myPeriod, bill.dueDay),
    canPay: !!myShare && myPeriod <= period
  };
}

function BillCard({
  bill,
  onOpen,
  onPay
}: {
  bill: RecurringBill;
  onOpen: () => void;
  onPay: () => void;
}) {
  const facts = useBillFacts(bill);
  const { myShare, canPay, myStatus } = facts;
  const progress = facts.participants.length ? (facts.paidCount / facts.participants.length) * 100 : 0;

  return (
    <article className={`bill-card ${canPay ? `is-${myStatus.tone}` : ""}`}>
      <button className="bill-main" onClick={onOpen} type="button">
        <span className="bill-icon">
          <CalendarDays size={21} />
        </span>
        <span className="bill-title">
          <strong>{bill.title}</strong>
          <small>
            {money(facts.total)} al mes · día {bill.dueDay}
          </small>
        </span>
        <span className="bill-amount">
          <strong>{money(myShare?.amount ?? facts.total)}</strong>
          <small>{myShare ? "Tu parte" : "Total"}</small>
        </span>
      </button>

      <div className="bill-progress">
        <div className="progress-bar" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
        <span>
          {capitalize(facts.monthName)}: {facts.paidCount} de {facts.participants.length} pagaron
        </span>
        {facts.missingLine ? <small>{facts.missingLine}</small> : null}
        {facts.lateLine ? <small className="late-line">{facts.lateLine}</small> : null}
      </div>

      {myShare ? (
        canPay ? (
          <div className="bill-action">
            <span className={`due-chip ${myStatus.tone}`}>{myStatus.label}</span>
            <button
              className={myStatus.tone === "future" ? "secondary-action compact" : "primary-action compact"}
              onClick={onPay}
              type="button"
            >
              <HandCoins size={17} />
              {facts.myPeriod === facts.period ? "Pagar mi parte" : `Pagar ${facts.myMonthName}`}
            </button>
          </div>
        ) : (
          <div className="paid-line">
            <CheckCircle2 size={18} />
            Ya pagaste {facts.monthName}
          </div>
        )
      ) : (
        <div className="paid-line muted">No participas · {facts.status.label.toLowerCase()}</div>
      )}
    </article>
  );
}

function BillSheet({
  bill,
  onClose,
  onPay,
  onUnmark,
  onChangeAmount,
  onEdit,
  onDelete
}: {
  bill: RecurringBill;
  onClose: () => void;
  onPay: () => void;
  onUnmark: () => Promise<void>;
  onChangeAmount: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { getPerson, currentUserId } = useApp();
  const facts = useBillFacts(bill);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ path: string; person: string } | null>(null);
  const canManage = bill.createdBy === currentUserId || getPerson(currentUserId).role === "admin";
  const lastPaid = lastPaidPeriod(bill, currentUserId);
  const pastPeriods = [...new Set(bill.payments.map((payment) => payment.period))]
    .filter((period) => period !== facts.period)
    .sort()
    .reverse();

  async function undo() {
    setBusy(true);
    setError(null);
    try {
      await onUnmark();
    } catch {
      setError("No se pudo deshacer. Intenta de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet bill-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Pago mensual</p>
            <h2>{bill.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="money-card">
          <div>
            <span>Total al mes</span>
            <strong>{money(facts.total)}</strong>
          </div>
          <div>
            <span>{facts.myShare ? "Tu parte" : "Vence"}</span>
            <strong>{facts.myShare ? money(facts.myShare.amount) : `Día ${bill.dueDay}`}</strong>
          </div>
        </div>

        {facts.canPay ? (
          <button className="primary-action full" onClick={onPay} type="button">
            <HandCoins size={19} />
            Pagar mi parte de {facts.myMonthName}
          </button>
        ) : null}

        <section className="detail-section">
          <div className="detail-section-head">
            <strong>{capitalize(facts.monthName)}</strong>
            <span>
              {facts.paidCount} de {facts.participants.length} · {facts.status.label.toLowerCase()}
            </span>
          </div>
          <div className="list-card">
            {facts.participants.map((share) => {
              const person = getPerson(share.personId);
              const payment = facts.payments.find((item) => item.personId === share.personId);
              return (
                <div className="payment-row" key={share.personId}>
                  <Avatar person={person} size="sm" />
                  <span className="payment-person">
                    <strong>
                      {person.name}
                      {person.id === currentUserId ? " (tú)" : ""}
                    </strong>
                    {payment?.proofPath ? (
                      <button
                        className="proof-link"
                        onClick={() => setViewing({ path: payment.proofPath!, person: person.name })}
                        type="button"
                      >
                        <ImageIcon size={13} />
                        Ver comprobante
                      </button>
                    ) : (
                      <small>
                        {payment
                          ? methodLabel(payment.method) ?? "Pagado"
                          : facts.lateFrom(share.personId)
                            ? `Atrasado desde ${periodMonthName(facts.lateFrom(share.personId)!)}`
                            : "Sin pagar"}
                      </small>
                    )}
                  </span>
                  <span className="payment-side">
                    <strong>{money(payment?.amount ?? share.amount)}</strong>
                    <span className={`share-state is-${payment ? "confirmed" : "pending"}`}>
                      {payment ? "Pagó" : "Falta"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {lastPaid ? (
          <button className="undo-link" disabled={busy} onClick={undo} type="button">
            <Undo2 size={15} />
            Deshacer mi pago de {periodMonthName(lastPaid)}
          </button>
        ) : null}
        {error ? <div className="auth-alert error">{error}</div> : null}

        {pastPeriods.length ? (
          <details className="more-options">
            <summary>
              Meses anteriores
              <ChevronDown size={18} />
            </summary>
            <div className="list-card">
              {pastPeriods.map((period) => {
                const paid = bill.payments.filter((payment) => payment.period === period).length;
                return (
                  <div className="month-row" key={period}>
                    <span>{periodLabel(period)}</span>
                    <small>
                      {paid} de {facts.participants.length} pagaron
                    </small>
                  </div>
                );
              })}
            </div>
          </details>
        ) : null}

        {canManage ? (
          <div className="manage-block">
            <button className="secondary-action full" onClick={onChangeAmount} type="button">
              <Coins size={18} />
              Cambiar monto
            </button>
            <div className="detail-actions">
              <button className="secondary-action" onClick={onEdit} type="button">
                <Pencil size={18} />
                Editar
              </button>
              <button className="danger-action" onClick={onDelete} type="button">
                <Trash2 size={18} />
                Eliminar
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {viewing ? (
        <ModalBackdrop onClose={() => setViewing(null)}>
          <div className="modal-sheet photo-sheet">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Comprobante de {bill.title}</p>
                <h2>{viewing.person}</h2>
              </div>
              <button className="icon-button" onClick={() => setViewing(null)} type="button" aria-label="Volver al pago">
                <X size={20} />
              </button>
            </div>
            <ZoomableImage bucket="payment-proofs" path={viewing.path} alt={`Comprobante de ${viewing.person}`} />
          </div>
        </ModalBackdrop>
      ) : null}
    </ModalBackdrop>
  );
}

/** Cambio rápido del total: mantiene la proporción de cada persona. */
function BillAmountSheet({
  bill,
  onClose,
  onSubmit
}: {
  bill: RecurringBill;
  onClose: () => void;
  onSubmit: (input: NewRecurringBillInput) => Promise<void>;
}) {
  const { getPerson } = useApp();
  const facts = useBillFacts(bill);
  const [amount, setAmount] = useState(String(facts.total));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const total = parseMoney(amount);
  const shares = scaleShares(bill.shares.filter((share) => share.amount > 0), total);
  const changed = Math.abs(total - facts.total) >= 0.01;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (total <= 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      await onSubmit({ title: bill.title, dueDay: bill.dueDay, participants: shares });
      onClose();
    } catch {
      setError("No se pudo cambiar el monto. Intenta de nuevo.");
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onBack={onClose}>
      <form className="modal-sheet expense-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <p className="eyebrow">{bill.title}</p>
            <h2>Cambiar monto</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <label className="amount-field">
          <span>Nuevo total al mes</span>
          <input
            autoFocus
            inputMode="decimal"
            onChange={(event) => setAmount(event.target.value)}
            onFocus={(event) => event.target.select()}
            placeholder="0.00"
            value={amount}
          />
        </label>

        <section className="detail-section">
          <div className="detail-section-head">
            <strong>Así queda cada parte</strong>
          </div>
          <div className="list-card">
            {shares.map((share) => {
              const person = getPerson(share.personId);
              return (
                <div className="payment-row" key={share.personId}>
                  <Avatar person={person} size="sm" />
                  <span className="payment-person">
                    <strong>{person.name}</strong>
                  </span>
                  <span className="payment-side">
                    <strong>{money(share.amount)}</strong>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <p className="form-hint">
          Aplica desde {facts.monthName}. Quien ya pagó un mes conserva lo que pagó. Para repartirlo distinto, usa
          “Editar”.
        </p>

        {error ? <div className="auth-alert error">{error}</div> : null}

        <button className="primary-action full" disabled={total <= 0 || !changed || saving} type="submit">
          <Check size={19} />
          {saving ? "Guardando…" : `Guardar ${money(total)}`}
        </button>
      </form>
    </ModalBackdrop>
  );
}

export function MonthlyPanel({
  bills,
  adding,
  onCloseAdding,
  onCreate,
  onEdit,
  onDelete,
  onMarkPaid,
  onUnmark
}: {
  bills: RecurringBill[];
  adding: boolean;
  onCloseAdding: () => void;
  onCreate: (input: NewRecurringBillInput) => Promise<void>;
  onEdit: (billId: string, input: NewRecurringBillInput) => Promise<void>;
  onDelete: (bill: RecurringBill) => Promise<void>;
  onMarkPaid: (bill: RecurringBill, amount: number, method: PaymentMethod, proofFile: File | null) => Promise<void>;
  onUnmark: (bill: RecurringBill) => Promise<void>;
}) {
  const { currentUserId } = useApp();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [amountId, setAmountId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const find = (id: string | null) => bills.find((bill) => bill.id === id) ?? null;
  const active = find(activeId);
  const paying = find(payingId);
  const changingAmount = find(amountId);
  const editing = find(editingId);
  const deleting = find(deletingId);
  const payingShare = paying?.shares.find((share) => share.personId === currentUserId);

  return (
    <>
      {bills.length ? (
        <div className="group-stack">
          {bills.map((bill) => (
            <BillCard
              bill={bill}
              key={bill.id}
              onOpen={() => setActiveId(bill.id)}
              onPay={() => setPayingId(bill.id)}
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

      {active ? (
        <BillSheet
          bill={active}
          onChangeAmount={() => setAmountId(active.id)}
          onClose={() => setActiveId(null)}
          onDelete={() => setDeletingId(active.id)}
          onEdit={() => setEditingId(active.id)}
          onPay={() => setPayingId(active.id)}
          onUnmark={() => onUnmark(active)}
        />
      ) : null}
      {paying && payingShare ? (
        <RecurringPayForm
          amount={payingShare.amount}
          bill={paying}
          monthName={periodMonthName(firstUnpaidPeriod(paying, currentUserId))}
          onClose={() => setPayingId(null)}
          onSubmit={(method, proofFile) => onMarkPaid(paying, payingShare.amount, method, proofFile)}
        />
      ) : null}
      {changingAmount ? (
        <BillAmountSheet
          bill={changingAmount}
          onClose={() => setAmountId(null)}
          onSubmit={(input) => onEdit(changingAmount.id, input)}
        />
      ) : null}
      {editing ? (
        <RecurringBillForm
          initial={editing}
          onClose={() => setEditingId(null)}
          onSubmit={(input) => onEdit(editing.id, input)}
        />
      ) : null}
      {deleting ? (
        <ItemActionsSheet
          eyebrow="Pago mensual"
          onClose={() => setDeletingId(null)}
          onDelete={async () => {
            await onDelete(deleting);
            setDeletingId(null);
            setActiveId(null);
          }}
          title={deleting.title}
        />
      ) : null}
      {adding ? <RecurringBillForm onClose={onCloseAdding} onSubmit={onCreate} /> : null}
    </>
  );
}

export function RecurringPayForm({
  bill,
  amount,
  monthName,
  onClose,
  onSubmit
}: {
  bill: RecurringBill;
  amount: number;
  monthName: string;
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
          Tu parte de {monthName}: <strong>{money(amount)}</strong>
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

export function RecurringBillForm({
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
    <ModalBackdrop onBack={onClose}>
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
          <span>¿Quiénes pagan?</span>
          <div className="segmented">
            <button className={splitMode === "equal" ? "active" : ""} onClick={() => setSplitMode("equal")} type="button">
              Igual
            </button>
            <button className={splitMode === "custom" ? "active" : ""} onClick={() => setSplitMode("custom")} type="button">
              Personalizado
            </button>
          </div>
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
                  <span className="check-box">{isSelected ? <Check size={15} strokeWidth={3} /> : null}</span>
                  <Avatar person={person} size="sm" />
                  <span>{person.name}</span>
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
                  <strong>{isSelected ? money(evenAmounts[selectedPeople.indexOf(person)] ?? 0) : "—"}</strong>
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

        <p className="form-hint">
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
