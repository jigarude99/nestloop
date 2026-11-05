"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  HandCoins,
  Handshake,
  Image as ImageIcon,
  Minus,
  Pencil,
  Plus,
  ReceiptText,
  Scale,
  ShieldCheck,
  Trash2,
  Undo2,
  Upload,
  Users,
  X
} from "lucide-react";
import { FormEvent, ReactNode, useMemo, useState } from "react";
import { Person } from "../../lib/household";
import {
  expenseStatus,
  expenseTotals,
  namesList,
  type ExpenseBucket,
  type ExpenseStatus,
  type StampTone
} from "../../lib/expense-status";
import type {
  Expense,
  NewExpenseInput,
  NewRecurringBillInput,
  PaymentMethod,
  RecurringBill
} from "../../lib/api";
import {
  Avatar,
  CATEGORIES,
  ModalBackdrop,
  PhotoPicker,
  SignedImage,
  ZoomableImage,
  methodLabel,
  money,
  pairwiseBalance,
  parseMoney,
  relativeDate,
  shortDate,
  splitEvenly,
  useApp
} from "./core";
import { MonthlyPanel, monthlyIsDue } from "./monthly";

type SplitMode = "equal" | "custom";
export type ExpensesTab = "expenses" | "balances" | "monthly";

const STAMP_GLYPH: Record<StampTone, typeof Check> = {
  pay: AlertTriangle,
  review: Clock3,
  paid: Check,
  done: CheckCheck,
  other: Minus
};

/** El recibo de cada gasto: color y símbolo dicen en qué estado está para ti. */
export function ReceiptStamp({ tone, size = "md" }: { tone: StampTone; size?: "md" | "lg" }) {
  const Glyph = STAMP_GLYPH[tone];
  return (
    <span className={`stamp stamp-${tone} stamp-${size}`} aria-hidden="true">
      <svg viewBox="0 0 36 42" focusable="false">
        <path
          className="stamp-paper"
          d="M6 1.5h24A3.5 3.5 0 0 1 33.5 5v31.5l-3.9 3.2-3.9-3.2-3.9 3.2-3.8-3.2-3.9 3.2-3.9-3.2-3.9 3.2-3.8-3.2V5A3.5 3.5 0 0 1 6 1.5Z"
        />
        <path className="stamp-lines" d="M9.5 11h17M9.5 17.5h17M9.5 24h9" />
      </svg>
      <span className="stamp-badge">
        <Glyph size={size === "lg" ? 15 : 12} strokeWidth={3} />
      </span>
    </span>
  );
}

function statusCopy(expense: Expense, status: ExpenseStatus, getName: (id: string) => string) {
  const payer = getName(expense.paidBy);
  const date = shortDate(expense.purchasedAt);
  const open = namesList(status.openIds.map(getName));
  const review = namesList(status.reviewIds.map(getName));
  switch (status.bucket) {
    case "pay":
      return {
        line: status.rejected ? `${payer} rechazó tu pago. Revísalo` : `Pagó ${payer} · ${date}`,
        note: "Tu parte"
      };
    case "confirm":
      return { line: `${review} te avisó pago en efectivo`, note: "Por confirmar" };
    case "sent":
      return { line: `Esperando que ${payer} confirme`, note: "Tu parte" };
    case "waiting":
      return { line: `Faltan ${open}`, note: status.paidByMe ? "Te deben" : "Ya pagaste" };
    case "done":
      return { line: `Todos pagaron · ${date}`, note: "Total" };
    default:
      return { line: `Pagó ${payer} · no participas`, note: "Total" };
  }
}

export function ExpenseRow({ expense, onOpen }: { expense: Expense; onOpen: (id: string) => void }) {
  const { getPerson, currentUserId } = useApp();
  const status = expenseStatus(expense, currentUserId);
  const copy = statusCopy(expense, status, (id) => getPerson(id).shortName);

  return (
    <button className={`expense-card is-${status.tone}`} onClick={() => onOpen(expense.id)} type="button">
      <ReceiptStamp tone={status.tone} />
      <span className="expense-card-info">
        <strong>{expense.title}</strong>
        <small>{copy.line}</small>
      </span>
      <span className="expense-card-amount">
        <strong>{money(status.amount)}</strong>
        <small>{copy.note}</small>
      </span>
    </button>
  );
}

function ExpenseGroup({
  title,
  tone,
  count,
  collapsed,
  children
}: {
  title: string;
  tone: StampTone;
  count: number;
  collapsed?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(!collapsed);
  const head = (
    <>
      <span className={`group-dot is-${tone}`} aria-hidden="true" />
      <strong>{title}</strong>
      <span className="group-count">{count}</span>
    </>
  );
  return (
    <section className="list-group">
      {collapsed ? (
        <button className="group-head toggle" onClick={() => setOpen((value) => !value)} type="button" aria-expanded={open}>
          {head}
          <ChevronDown className={`group-chevron ${open ? "open" : ""}`} size={18} />
        </button>
      ) : (
        <div className="group-head">{head}</div>
      )}
      {open ? <div className="list-card">{children}</div> : null}
    </section>
  );
}

function ExpensesPanel({ expenses, onOpen }: { expenses: Expense[]; onOpen: (id: string) => void }) {
  const { currentUserId } = useApp();
  const groups = useMemo(() => {
    const byBucket: Record<ExpenseBucket, Expense[]> = { pay: [], confirm: [], sent: [], waiting: [], done: [], other: [] };
    for (const expense of expenses) byBucket[expenseStatus(expense, currentUserId).bucket].push(expense);
    return byBucket;
  }, [expenses, currentUserId]);

  if (!expenses.length) {
    return (
      <div className="empty-state">
        <ReceiptText size={28} />
        <strong>Aún no hay gastos</strong>
        <span>Crea el primero con “Agregar gasto”.</span>
      </div>
    );
  }

  const row = (expense: Expense) => <ExpenseRow expense={expense} key={expense.id} onOpen={onOpen} />;
  const waiting = [...groups.sent, ...groups.waiting];

  return (
    <div className="group-stack">
      {groups.pay.length ? (
        <ExpenseGroup count={groups.pay.length} title="Te toca pagar" tone="pay">
          {groups.pay.map(row)}
        </ExpenseGroup>
      ) : (
        <div className="all-clear">
          <ReceiptStamp tone="done" />
          <span>
            <strong>No tienes nada por pagar</strong>
            <small>Estás al día con todas las facturas.</small>
          </span>
        </div>
      )}
      {groups.confirm.length ? (
        <ExpenseGroup count={groups.confirm.length} title="Confirma estos pagos" tone="review">
          {groups.confirm.map(row)}
        </ExpenseGroup>
      ) : null}
      {waiting.length ? (
        <ExpenseGroup count={waiting.length} title="Ya pagaste, falta gente" tone="paid">
          {waiting.map(row)}
        </ExpenseGroup>
      ) : null}
      {groups.done.length ? (
        <ExpenseGroup collapsed count={groups.done.length} title="Completas" tone="done">
          {groups.done.map(row)}
        </ExpenseGroup>
      ) : null}
      {groups.other.length ? (
        <ExpenseGroup collapsed count={groups.other.length} title="No participas" tone="other">
          {groups.other.map(row)}
        </ExpenseGroup>
      ) : null}
    </div>
  );
}

function BalancesPanel({
  expenses,
  onOpenBalance
}: {
  expenses: Expense[];
  onOpenBalance: (person: Person) => void;
}) {
  const { people, currentUserId } = useApp();
  const rows = useMemo(
    () =>
      people
        .filter((person) => person.id !== currentUserId)
        .map((person) => ({ person, pair: pairwiseBalance(expenses, currentUserId, person.id) })),
    [people, expenses, currentUserId]
  );
  const debts = rows.filter((row) => row.pair.net > 0.004).sort((a, b) => b.pair.net - a.pair.net);
  const credits = rows.filter((row) => row.pair.net < -0.004).sort((a, b) => a.pair.net - b.pair.net);
  const even = rows.filter((row) => Math.abs(row.pair.net) <= 0.004);
  const iOwe = debts.reduce((total, row) => total + row.pair.net, 0);
  const owedToMe = credits.reduce((total, row) => total - row.pair.net, 0);

  if (!rows.length) {
    return (
      <div className="empty-state">
        <Users size={28} />
        <strong>Aún están solos en la casa</strong>
        <span>Invita a tu familia desde “Personas”.</span>
      </div>
    );
  }

  const row = ({ person, pair }: (typeof rows)[number]) => {
    const count = pair.iOweItems.length + pair.theyOweItems.length;
    const tone = pair.net > 0.004 ? "owe" : pair.net < -0.004 ? "get" : "even";
    return (
      <button className="settle-row" key={person.id} onClick={() => onOpenBalance(person)} type="button">
        <Avatar person={person} size="md" />
        <span className="settle-row-main">
          <strong>{person.name}</strong>
          <small>{count ? `${count} ${count === 1 ? "factura abierta" : "facturas abiertas"}` : "Sin cuentas abiertas"}</small>
        </span>
        <span className={`settle-amount ${tone}`}>
          {tone === "even" ? "A mano" : money(Math.abs(pair.net))}
        </span>
        <ChevronRight size={18} />
      </button>
    );
  };

  return (
    <div className="group-stack">
      <div className="money-card">
        <div>
          <span>Debes en total</span>
          <strong>{money(iOwe)}</strong>
        </div>
        <div>
          <span>Te deben en total</span>
          <strong className="positive">{money(owedToMe)}</strong>
        </div>
      </div>
      <p className="section-note">Con cada persona se compensa lo que le debes con lo que te debe.</p>
      {debts.length ? (
        <ExpenseGroup count={debts.length} title="Le debes a" tone="pay">
          {debts.map(row)}
        </ExpenseGroup>
      ) : null}
      {credits.length ? (
        <ExpenseGroup count={credits.length} title="Te deben" tone="paid">
          {credits.map(row)}
        </ExpenseGroup>
      ) : null}
      {even.length ? (
        <ExpenseGroup collapsed={!!(debts.length || credits.length)} count={even.length} title="A mano" tone="done">
          {even.map(row)}
        </ExpenseGroup>
      ) : null}
    </div>
  );
}

export function ExpensesView({
  expenses,
  recurringBills,
  tab,
  setTab,
  onAddExpense,
  onOpenBalance,
  onCreateBill,
  onEditBill,
  onDeleteBill,
  onMarkBillPaid,
  onUnmarkBill,
  setActiveExpenseId
}: {
  expenses: Expense[];
  recurringBills: RecurringBill[];
  tab: ExpensesTab;
  setTab: (tab: ExpensesTab) => void;
  onAddExpense: () => void;
  onOpenBalance: (person: Person) => void;
  onCreateBill: (input: NewRecurringBillInput) => Promise<void>;
  onEditBill: (billId: string, input: NewRecurringBillInput) => Promise<void>;
  onDeleteBill: (bill: RecurringBill) => Promise<void>;
  onMarkBillPaid: (bill: RecurringBill, amount: number, method: PaymentMethod, proofFile: File | null) => Promise<void>;
  onUnmarkBill: (bill: RecurringBill) => Promise<void>;
  setActiveExpenseId: (id: string) => void;
}) {
  const { currentUserId } = useApp();
  const [addingBill, setAddingBill] = useState(false);
  const totals = useMemo(() => expenseTotals(expenses, currentUserId), [expenses, currentUserId]);
  const monthlyDue = recurringBills.some((bill) => monthlyIsDue(bill, currentUserId));

  return (
    <section className="view-stack">
      <header className="view-header">
        <h1>Gastos</h1>
        {tab === "expenses" ? (
          <button className="primary-action compact" onClick={onAddExpense} type="button">
            <Plus size={18} />
            Agregar gasto
          </button>
        ) : tab === "monthly" ? (
          <button className="primary-action compact" onClick={() => setAddingBill(true)} type="button">
            <Plus size={18} />
            Agregar mensual
          </button>
        ) : null}
      </header>

      <div className="subtabs" aria-label="Secciones de gastos">
        <button className={tab === "expenses" ? "active" : ""} onClick={() => setTab("expenses")} type="button">
          Facturas
        </button>
        <button className={tab === "balances" ? "active" : ""} onClick={() => setTab("balances")} type="button">
          Saldos
        </button>
        <button className={tab === "monthly" ? "active" : ""} onClick={() => setTab("monthly")} type="button">
          Mensual
          {monthlyDue ? <span className="subtab-dot" aria-label="Tienes un pago próximo" /> : null}
        </button>
      </div>

      {tab === "expenses" ? (
        <>
          <div className="money-card">
            <div>
              <span>Te toca pagar</span>
              <strong>{money(totals.toPay)}</strong>
            </div>
            <div>
              <span>Te deben</span>
              <strong className="positive">{money(totals.incoming)}</strong>
            </div>
          </div>
          <ExpensesPanel expenses={expenses} onOpen={setActiveExpenseId} />
        </>
      ) : tab === "balances" ? (
        <BalancesPanel expenses={expenses} onOpenBalance={onOpenBalance} />
      ) : (
        <MonthlyPanel
          adding={addingBill}
          bills={recurringBills}
          onCloseAdding={() => setAddingBill(false)}
          onCreate={onCreateBill}
          onDelete={onDeleteBill}
          onEdit={onEditBill}
          onMarkPaid={onMarkBillPaid}
          onUnmark={onUnmarkBill}
        />
      )}
    </section>
  );
}

export function ExpenseForm({
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
    <ModalBackdrop onBack={onClose}>
      <form className="modal-sheet expense-form" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <h2>{isEdit ? "Editar gasto" : "Nuevo gasto"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <label className="amount-field">
          <span>Total</span>
          <input
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
        </label>

        <label>
          <span>Título</span>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onFocus={(event) => {
              if (!isEdit && title === "Compra compartida") event.target.select();
            }}
          />
        </label>

        <div className="form-grid two">
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
          <label>
            <span>Fecha</span>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
        </div>

        <div className="split-toolbar">
          <span>¿Entre quiénes?</span>
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
                  aria-pressed={!!isSelected}
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

        <PhotoPicker
          file={receiptFile}
          onPick={setReceiptFile}
          label={isEdit && initial?.receiptPath ? "Cambiar foto de la factura" : "Foto de la factura (opcional)"}
        />

        <details className="more-options" open={isEdit && !!(merchant || note)}>
          <summary>
            Más opciones
            <ChevronDown size={18} />
          </summary>
          <div className="more-options-body">
            <div className="form-grid two">
              <label>
                <span>Tienda</span>
                <input placeholder="Ej: Walmart" value={merchant} onChange={(event) => setMerchant(event.target.value)} />
              </label>
              <label>
                <span>Categoría</span>
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  {CATEGORIES.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              <span>Nota</span>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Opcional" rows={2} />
            </label>
            <label className={`privacy-option ${hiddenFromNonParticipants ? "active" : ""}`}>
              <input
                checked={hiddenFromNonParticipants}
                onChange={(event) => setHiddenFromNonParticipants(event.target.checked)}
                type="checkbox"
              />
              <span>
                <strong>Ocultar a quienes no participan</strong>
                <small>Solo lo verán quien pagó, quien lo creó y las personas seleccionadas.</small>
              </span>
            </label>
          </div>
        </details>

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

function shareLabel(status: Expense["shares"][number]["status"]) {
  if (status === "confirmed") return "Pagó";
  if (status === "sent") return "Por confirmar";
  if (status === "rejected") return "Rechazado";
  return "Falta";
}

export function ExpenseDetail({
  expense,
  currentUser,
  onClose,
  onMarkPaid,
  onCancelCashPayment,
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
  onCancelCashPayment: (expenseId: string) => Promise<void>;
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
  const [confirmCancelCash, setConfirmCancelCash] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(false);
  const [viewingProof, setViewingProof] = useState<{ path: string; person: string } | null>(null);

  const status = expenseStatus(expense, currentUser.id);
  const payer = getPerson(expense.paidBy);
  const currentShare = expense.shares.find((share) => share.personId === currentUser.id);
  const cashAwaitingConfirmation = currentShare?.status === "sent";
  const needsProof = method !== "cash";
  const canSendPayment =
    !!currentShare &&
    (currentShare.status === "pending" || currentShare.status === "rejected") &&
    (!needsProof || !!proofFile) &&
    !busy;
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
    !cashAwaitingConfirmation &&
    unsettledShares.length > 0 &&
    reimbursementCount > 0 &&
    (!bulkNeedsProof || !!bulkProofFile) &&
    !busy;

  const openNames = namesList(status.openIds.map((id) => getPerson(id).shortName), 3);
  const reviewNames = namesList(status.reviewIds.map((id) => getPerson(id).shortName), 3);
  const summary: Record<ExpenseBucket, { title: string; line: string }> = {
    pay: {
      title: status.rejected ? `Revisa tu pago de ${money(status.amount)}` : `Te toca pagar ${money(status.amount)}`,
      line: status.rejected ? `${payer.shortName} rechazó el pago anterior.` : `Se lo pagas a ${payer.shortName}.`
    },
    confirm: {
      title: `Confirma ${money(status.amount)}`,
      line: `${reviewNames} te avisó que pagó en efectivo.`
    },
    sent: { title: "Pago enviado", line: `Falta que ${payer.shortName} confirme tu efectivo.` },
    waiting: {
      title: status.paidByMe ? `Te deben ${money(status.amount)}` : "Ya pagaste tu parte",
      line: `Faltan ${openNames}.`
    },
    done: { title: "Factura completa", line: "Todos pagaron su parte." },
    other: {
      title: "No participas en este gasto",
      line: status.openIds.length ? `Faltan ${openNames}.` : "Todos pagaron su parte."
    }
  };
  const orderedShares = [...expense.shares].sort((a, b) => {
    const rank = (personId: string, confirmed: boolean) => (personId === expense.paidBy ? 2 : confirmed ? 1 : 0);
    return rank(a.personId, a.status === "confirmed") - rank(b.personId, b.status === "confirmed");
  });

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (caught) {
      const message =
        caught && typeof caught === "object" && "message" in caught && typeof caught.message === "string"
          ? caught.message
          : "No se pudo guardar. Intenta de nuevo.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal-sheet detail-sheet">
        <div className="modal-header">
          <div>
            <p className="eyebrow">
              {expense.category} · {shortDate(expense.purchasedAt)}
            </p>
            <h2>{expense.title}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className={`status-banner is-${status.tone}`}>
          <ReceiptStamp size="lg" tone={status.tone} />
          <div>
            <strong>{summary[status.bucket].title}</strong>
            <span>{summary[status.bucket].line}</span>
          </div>
        </div>

        {currentShare && currentShare.status !== "confirmed" && expense.paidBy !== currentUser.id ? (
          cashAwaitingConfirmation ? (
            <div className="payment-box">
              {confirmCancelCash ? (
                <div className="cancel-payment-confirm" role="alert">
                  <strong>¿Cancelar el aviso de efectivo?</strong>
                  <span>Tu parte volverá a aparecer como pendiente y podrás elegir otra forma de pago.</span>
                  <div className="row-actions">
                    <button
                      className="tiny-button"
                      disabled={busy}
                      onClick={() => setConfirmCancelCash(false)}
                      type="button"
                    >
                      Volver
                    </button>
                    <button
                      className="tiny-button good"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await onCancelCashPayment(expense.id);
                          setConfirmCancelCash(false);
                        })
                      }
                      type="button"
                    >
                      {busy ? "Cancelando…" : "Sí, cancelar aviso"}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="secondary-action full"
                  disabled={busy}
                  onClick={() => setConfirmCancelCash(true)}
                  type="button"
                >
                  <Undo2 size={18} />
                  Cancelar aviso de efectivo
                </button>
              )}
            </div>
          ) : (
            <div className="payment-box">
              <div className="split-toolbar">
                <span>¿Cómo pagaste?</span>
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
                <PhotoPicker file={proofFile} onPick={setProofFile} label="Sube la captura del pago" icon={Upload} />
              ) : (
                <div className="cash-note">
                  <HandCoins size={19} />
                  <span>{payer.shortName} tendrá que confirmar que recibió el efectivo.</span>
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
          )
        ) : null}

        {error ? <div className="auth-alert error">{error}</div> : null}

        <section className="detail-section">
          <div className="detail-section-head">
            <strong>Quién ha pagado</strong>
            {status.totalCount ? (
              <span>
                {status.paidCount} de {status.totalCount}
              </span>
            ) : null}
          </div>
          {status.totalCount ? (
            <div className="progress-bar" aria-hidden="true">
              <span style={{ width: `${Math.round((status.paidCount / status.totalCount) * 100)}%` }} />
            </div>
          ) : null}
          <div className="list-card">
            {orderedShares.map((share) => {
              const person = getPerson(share.personId);
              const isPayer = share.personId === expense.paidBy;
              const canReview =
                expense.paidBy === currentUser.id && share.personId !== currentUser.id && share.status === "sent";
              return (
                <div className="payment-row" key={share.personId}>
                  <Avatar person={person} size="sm" />
                  <span className="payment-person">
                    <strong>
                      {person.name}
                      {person.id === currentUser.id ? " (tú)" : ""}
                    </strong>
                    {share.proofPath ? (
                      <button
                        className="proof-link"
                        type="button"
                        onClick={() => setViewingProof({ path: share.proofPath!, person: person.name })}
                      >
                        <ImageIcon size={13} />
                        Ver comprobante
                      </button>
                    ) : isPayer || share.paymentMethod ? (
                      <small>{isPayer ? "Pagó la factura" : methodLabel(share.paymentMethod)}</small>
                    ) : null}
                  </span>
                  <span className="payment-side">
                    <strong>{money(share.amount)}</strong>
                    <span className={`share-state is-${share.status}`}>{shareLabel(share.status)}</span>
                  </span>
                  {canReview ? (
                    <div className="row-actions">
                      <button
                        className="tiny-button"
                        disabled={busy}
                        onClick={() => run(() => onReject(expense.id, share.personId))}
                        type="button"
                      >
                        Rechazar
                      </button>
                      <button
                        className="tiny-button good"
                        disabled={busy}
                        onClick={() => run(() => onConfirm(expense.id, share.personId))}
                        type="button"
                      >
                        Aceptar
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        <section className="detail-section">
          <div className="detail-section-head">
            <strong>Factura</strong>
          </div>
          <div className="invoice-card">
            {expense.receiptPath ? (
              <button
                className="receipt-open-button"
                onClick={() => setViewingReceipt(true)}
                type="button"
                aria-label="Ver factura completa"
              >
                <SignedImage bucket="receipts" path={expense.receiptPath} alt="Factura" />
              </button>
            ) : (
              <span className="receipt-empty">
                <ReceiptText size={22} />
                Sin foto
              </span>
            )}
            <dl>
              <div>
                <dt>Total</dt>
                <dd>{money(expense.amount)}</dd>
              </div>
              <div>
                <dt>Pagó</dt>
                <dd>{payer.name}</dd>
              </div>
              {expense.merchant ? (
                <div>
                  <dt>Tienda</dt>
                  <dd>{expense.merchant}</dd>
                </div>
              ) : null}
              <div>
                <dt>Agregado</dt>
                <dd>{relativeDate(expense.createdAt)}</dd>
              </div>
            </dl>
          </div>
          {expense.note ? <p className="invoice-note">{expense.note}</p> : null}
        </section>

        {expense.paidBy !== currentUser.id &&
        !cashAwaitingConfirmation &&
        unsettledShares.length > 0 &&
        reimbursementCount > 0 ? (
          <details className="more-options">
            <summary>
              Pagar por todos
              <ChevronDown size={18} />
            </summary>
            <div className="more-options-body">
              <p className="form-hint">
                Pagas {money(bulkTotal)} a {payer.shortName}. Luego NestLoop crea un reembolso para{" "}
                {reimbursementCount} {reimbursementCount === 1 ? "persona" : "personas"}.
              </p>
              <div className="segmented wide">
                <button className={bulkMethod === "transfer" ? "active" : ""} onClick={() => setBulkMethod("transfer")} type="button">
                  Transferencia
                </button>
                <button className={bulkMethod === "cash" ? "active" : ""} onClick={() => setBulkMethod("cash")} type="button">
                  Efectivo
                </button>
              </div>
              {bulkMethod !== "cash" ? (
                <PhotoPicker file={bulkProofFile} onPick={setBulkProofFile} label="Comprobante del pago completo" icon={Upload} />
              ) : (
                <div className="cash-note">
                  <HandCoins size={19} />
                  <span>El gasto original se cerrará y las deudas restantes pasarán a ti.</span>
                </div>
              )}
              <button
                className="secondary-action full"
                disabled={!canPayForEveryone}
                onClick={() => run(() => onPayForEveryone(expense, bulkMethod, bulkProofFile))}
                type="button"
              >
                <BadgeCheck size={19} />
                {busy ? "Guardando…" : `Pagar todo (${money(bulkTotal)})`}
              </button>
            </div>
          </details>
        ) : null}

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
      </div>

      {viewingReceipt && expense.receiptPath ? (
        <ModalBackdrop onClose={() => setViewingReceipt(false)}>
          <div className="modal-sheet photo-sheet">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Factura completa</p>
                <h2>{expense.title}</h2>
              </div>
              <button className="icon-button" onClick={() => setViewingReceipt(false)} type="button" aria-label="Volver al gasto">
                <X size={20} />
              </button>
            </div>
            <ZoomableImage bucket="receipts" path={expense.receiptPath} alt={`Factura de ${expense.title}`} />
          </div>
        </ModalBackdrop>
      ) : null}

      {viewingProof ? (
        <ModalBackdrop onClose={() => setViewingProof(null)}>
          <div className="modal-sheet photo-sheet">
            <div className="modal-header">
              <div>
                <p className="eyebrow">Comprobante de pago</p>
                <h2>{viewingProof.person}</h2>
              </div>
              <button className="icon-button" onClick={() => setViewingProof(null)} type="button" aria-label="Volver al gasto">
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

export function BalanceSheet({
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
