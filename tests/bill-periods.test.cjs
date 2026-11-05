const { test } = require("node:test");
const assert = require("node:assert/strict");
const { billActivePeriod, billDisplayPeriod, firstUnpaidPeriod } = require("../lib/bill-periods.ts");

const paid = (personId, ...periods) => periods.map((period) => ({ personId, period, paidAt: `${period}-03T00:00:00Z` }));
const bill = (payments = [], createdAt = "2026-06-25T12:00:00Z") => ({
  id: "b",
  title: "Renta",
  dueDay: 5,
  createdBy: "yo",
  createdAt,
  shares: [
    { personId: "yo", amount: 100 },
    { personId: "samar", amount: 100 }
  ],
  payments
});
const on = (date) => new Date(`${date}T15:00:00Z`);

test("creada después del día de pago: arranca el mes siguiente", () => {
  assert.equal(billActivePeriod(bill()), "2026-07");
  assert.equal(billDisplayPeriod(bill(), on("2026-06-26")), "2026-07");
  assert.equal(firstUnpaidPeriod(bill(), "yo"), "2026-07");
});

test("creada antes del día de pago: arranca ese mismo mes", () => {
  assert.equal(firstUnpaidPeriod(bill([], "2026-06-02T12:00:00Z"), "yo"), "2026-06");
});

test("si una persona se atrasa, las demás pueden seguir pagando los meses nuevos", () => {
  const list = bill([...paid("yo", "2026-07", "2026-08"), ...paid("samar", "2026-07")]);
  assert.equal(billActivePeriod(list), "2026-08");
  assert.equal(firstUnpaidPeriod(list, "yo"), "2026-09");
  assert.equal(firstUnpaidPeriod(list, "samar"), "2026-08");
  assert.equal(billDisplayPeriod(list, on("2026-09-01")), "2026-09");
});

test("la tarjeta pasa al mes nuevo una semana antes del vencimiento", () => {
  const list = bill([...paid("yo", "2026-07"), ...paid("samar", "2026-07")]);
  assert.equal(billDisplayPeriod(list, on("2026-07-20")), "2026-08");
  const unpaid = bill();
  assert.equal(billDisplayPeriod(unpaid, on("2026-07-28")), "2026-07");
  assert.equal(billDisplayPeriod(unpaid, on("2026-07-29")), "2026-08");
});

test("si todos pagaron por adelantado, muestra el siguiente mes pendiente", () => {
  const list = bill([...paid("yo", "2026-07", "2026-08"), ...paid("samar", "2026-07", "2026-08")]);
  assert.equal(billDisplayPeriod(list, on("2026-07-10")), "2026-09");
});

test("diciembre pasa a enero del año siguiente", () => {
  const list = bill([...paid("yo", "2026-12"), ...paid("samar", "2026-12")], "2026-11-20T12:00:00Z");
  assert.equal(billActivePeriod(list), "2027-01");
});
