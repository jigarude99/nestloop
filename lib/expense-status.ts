import type { Expense, RecurringShare } from "./api";

/** Dónde cae una factura según lo que le toca hacer a quien la mira. */
export type ExpenseBucket = "pay" | "confirm" | "sent" | "waiting" | "done" | "other";

/** Color del recibo: rojo debes, ámbar en revisión, verde pagaste, azul completa, gris no participas. */
export type StampTone = "pay" | "review" | "paid" | "done" | "other";

export type ExpenseStatus = {
  bucket: ExpenseBucket;
  tone: StampTone;
  /** El número que le importa a esta persona: su parte, lo que le deben o el total. */
  amount: number;
  /** Tocó volver a pagar porque quien recibe rechazó el pago anterior. */
  rejected: boolean;
  paidByMe: boolean;
  /** Personas que aún no terminan de pagar (sin contar a quien pagó la factura). */
  openIds: string[];
  /** Personas que avisaron pago en efectivo y esperan confirmación. */
  reviewIds: string[];
  paidCount: number;
  totalCount: number;
};

const toCents = (value: number) => Math.round(value * 100);
const sum = (values: number[]) => values.reduce((total, value) => total + toCents(value), 0) / 100;

export function expenseStatus(expense: Expense, meId: string): ExpenseStatus {
  const paidByMe = expense.paidBy === meId;
  const mine = expense.shares.find((share) => share.personId === meId);
  const debtors = expense.shares.filter((share) => share.personId !== expense.paidBy);
  const open = debtors.filter((share) => share.status !== "confirmed");
  const review = open.filter((share) => share.status === "sent");

  const base = {
    rejected: !paidByMe && mine?.status === "rejected",
    paidByMe,
    openIds: open.map((share) => share.personId),
    reviewIds: review.map((share) => share.personId),
    paidCount: debtors.length - open.length,
    totalCount: debtors.length
  };

  if (!paidByMe && mine && (mine.status === "pending" || mine.status === "rejected")) {
    return { ...base, bucket: "pay", tone: "pay", amount: mine.amount };
  }
  if (paidByMe && review.length) {
    return { ...base, bucket: "confirm", tone: "review", amount: sum(review.map((share) => share.amount)) };
  }
  if (!paidByMe && mine?.status === "sent") {
    return { ...base, bucket: "sent", tone: "review", amount: mine.amount };
  }
  if (!paidByMe && !mine) {
    return { ...base, bucket: "other", tone: "other", amount: expense.amount };
  }
  if (open.length) {
    return {
      ...base,
      bucket: "waiting",
      tone: "paid",
      amount: paidByMe ? sum(open.map((share) => share.amount)) : mine?.amount ?? 0
    };
  }
  return { ...base, bucket: "done", tone: "done", amount: expense.amount };
}

/** Totales de la pantalla de gastos: lo que me toca pagar y lo que me deben. */
export function expenseTotals(expenses: Expense[], meId: string) {
  let toPay = 0;
  let incoming = 0;
  for (const expense of expenses) {
    const status = expenseStatus(expense, meId);
    if (status.bucket === "pay") toPay += toCents(status.amount);
    if (status.paidByMe) {
      for (const share of expense.shares) {
        if (share.personId !== meId && share.status !== "confirmed") incoming += toCents(share.amount);
      }
    }
  }
  return { toPay: toPay / 100, incoming: incoming / 100 };
}

/** "Samar", "Samar y Alan", "Samar, Alan y 2 más". */
export function namesList(names: string[], max = 2): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length <= max) return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(", ")} y ${names.length - max} más`;
}

/**
 * Reparte un nuevo total respetando la proporción de cada persona. Los centavos
 * que sobran del redondeo van a quien tenía la mayor fracción, así la suma cuadra.
 */
export function scaleShares(shares: RecurringShare[], newTotal: number): RecurringShare[] {
  const targetCents = Math.round(newTotal * 100);
  const currentCents = shares.reduce((total, share) => total + toCents(share.amount), 0);
  if (!shares.length || targetCents <= 0) return shares.map((share) => ({ ...share, amount: 0 }));

  const exact = shares.map((share) =>
    currentCents > 0 ? (toCents(share.amount) * targetCents) / currentCents : targetCents / shares.length
  );
  const floors = exact.map(Math.floor);
  let left = targetCents - floors.reduce((total, cents) => total + cents, 0);
  const order = exact
    .map((value, index) => ({ index, fraction: value - floors[index] }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of order) {
    if (left <= 0) break;
    floors[index] += 1;
    left -= 1;
  }
  return shares.map((share, index) => ({ ...share, amount: floors[index] / 100 }));
}
