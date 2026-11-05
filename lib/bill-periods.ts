import type { RecurringBill } from "./api";

const MESES_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
];
function periodKey(year: number, month0: number): string {
  return `${year}-${String(month0 + 1).padStart(2, "0")}`;
}
/** Nombre del mes (en español) de un periodo 'YYYY-MM'. */
export function periodMonthName(period: string): string {
  const m = Number(period.slice(5, 7));
  return MESES_ES[m - 1] ?? period;
}
/** Fecha de vencimiento (UTC) del periodo dado para un día de pago. */
export function periodDueDate(period: string, dueDay: number): Date {
  const year = Number(period.slice(0, 4));
  const month0 = Number(period.slice(5, 7)) - 1;
  return new Date(Date.UTC(year, month0, Math.min(dueDay, 28)));
}

/**
 * "Periodo activo" de una cuenta mensual: el primer mes (desde el ancla) que
 * aún NO han pagado todos los participantes. El ancla es el mes de creación si
 * se creó en/antes del día de pago; si no, el mes siguiente. Así, si al crear
 * la cuenta el plazo de este mes ya pasó, arranca en el mes siguiente, y avanza
 * solo conforme se paga. Misma lógica que recurring_active_period() en la BD.
 */
export function billActivePeriod(bill: RecurringBill): string {
  const parts = bill.shares.filter((s) => s.amount > 0);
  let period = billAnchorPeriod(bill);
  if (parts.length === 0) return period;

  for (let guard = 0; guard <= 240; guard++) {
    const current = period;
    const allPaid = parts.every((s) =>
      bill.payments.some((p) => p.period === current && p.personId === s.personId)
    );
    if (!allPaid) return period;
    period = nextPeriod(period);
  }
  return period;
}

function billAnchorPeriod(bill: RecurringBill): string {
  const created = new Date(bill.createdAt);
  const period = periodKey(created.getUTCFullYear(), created.getUTCMonth());
  return created.getUTCDate() > Math.min(bill.dueDay, 28) ? nextPeriod(period) : period;
}

function nextPeriod(period: string): string {
  const year = Number(period.slice(0, 4));
  const month0 = Number(period.slice(5, 7)) - 1;
  return month0 === 11 ? periodKey(year + 1, 0) : periodKey(year, month0 + 1);
}

/** Los avisos de cada mes arrancan esta cantidad de días antes del vencimiento. */
const BILL_NOTICE_DAYS = 7;

/**
 * El mes que se muestra en la tarjeta: el último cuyo aviso ya arrancó, o el
 * periodo activo si todos van adelantados. Así un atraso de una persona no
 * deja a la casa viendo un mes viejo.
 */
export function billDisplayPeriod(bill: RecurringBill, now = new Date()): string {
  const limit = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + BILL_NOTICE_DAYS);
  let opened = billAnchorPeriod(bill);
  for (let guard = 0; guard <= 240; guard++) {
    const next = nextPeriod(opened);
    if (periodDueDate(next, bill.dueDay).getTime() > limit) break;
    opened = next;
  }
  const active = billActivePeriod(bill);
  return active > opened ? active : opened;
}

/** El primer mes que le falta pagar a una persona: cada quien avanza por su cuenta. */
export function firstUnpaidPeriod(bill: RecurringBill, personId: string): string {
  let period = billAnchorPeriod(bill);
  for (let guard = 0; guard <= 240; guard++) {
    const current = period;
    if (!bill.payments.some((p) => p.period === current && p.personId === personId)) return period;
    period = nextPeriod(period);
  }
  return period;
}

/** El último periodo que pagó una persona en una cuenta (para deshacer). */
export function lastPaidPeriod(bill: RecurringBill, personId: string): string | null {
  const mine = bill.payments.filter((p) => p.personId === personId).map((p) => p.period);
  return mine.length ? mine.sort().slice(-1)[0] : null;
}
