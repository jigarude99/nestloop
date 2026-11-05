const { test } = require("node:test");
const assert = require("node:assert/strict");
const { expenseStatus, expenseTotals, namesList, scaleShares } = require("../lib/expense-status.ts");

const me = "me";
const expense = (paidBy, shares, amount = 90) => ({
  id: "e",
  title: "Prueba",
  amount,
  paidBy,
  shares: shares.map(([personId, status, value = 30]) => ({ personId, status, amount: value }))
});

test("debo mi parte: rojo y el número es mi parte, no el total", () => {
  const status = expenseStatus(expense("ana", [["ana", "confirmed"], [me, "pending"], ["leo", "pending"]]), me);
  assert.equal(status.bucket, "pay");
  assert.equal(status.tone, "pay");
  assert.equal(status.amount, 30);
  assert.deepEqual(status.openIds, [me, "leo"]);
});

test("me rechazaron el pago: vuelve a tocarme pagar", () => {
  const status = expenseStatus(expense("ana", [["ana", "confirmed"], [me, "rejected"]]), me);
  assert.equal(status.bucket, "pay");
  assert.equal(status.rejected, true);
});

test("yo pagué mi parte y falta gente: verde", () => {
  const status = expenseStatus(expense("ana", [["ana", "confirmed"], [me, "confirmed"], ["leo", "pending"]]), me);
  assert.equal(status.bucket, "waiting");
  assert.equal(status.tone, "paid");
  assert.equal(status.amount, 30);
  assert.deepEqual(status.openIds, ["leo"]);
});

test("yo pagué la factura y me deben: verde con lo que falta por cobrar", () => {
  const status = expenseStatus(expense(me, [[me, "confirmed"], ["ana", "pending"], ["leo", "confirmed"]]), me);
  assert.equal(status.bucket, "waiting");
  assert.equal(status.amount, 30);
  assert.equal(status.paidCount, 1);
  assert.equal(status.totalCount, 2);
});

test("todos pagaron: azul con el total", () => {
  const status = expenseStatus(expense("ana", [["ana", "confirmed"], [me, "confirmed"], ["leo", "confirmed"]]), me);
  assert.equal(status.bucket, "done");
  assert.equal(status.tone, "done");
  assert.equal(status.amount, 90);
});

test("avisé efectivo: ámbar, esperando confirmación", () => {
  const status = expenseStatus(expense("ana", [["ana", "confirmed"], [me, "sent"]]), me);
  assert.equal(status.bucket, "sent");
  assert.equal(status.tone, "review");
});

test("me avisaron efectivo: me toca confirmar antes que cualquier otra cosa", () => {
  const status = expenseStatus(expense(me, [[me, "confirmed"], ["ana", "sent"], ["leo", "pending"]]), me);
  assert.equal(status.bucket, "confirm");
  assert.equal(status.amount, 30);
  assert.deepEqual(status.reviewIds, ["ana"]);
});

test("no participo: gris aunque esté abierta o completa", () => {
  assert.equal(expenseStatus(expense("ana", [["ana", "confirmed"], ["leo", "pending"]]), me).bucket, "other");
  assert.equal(expenseStatus(expense("ana", [["ana", "confirmed"], ["leo", "confirmed"]]), me).tone, "other");
});

test("quien paga sin dividir con nadie queda completa", () => {
  assert.equal(expenseStatus(expense(me, [[me, "confirmed"]]), me).bucket, "done");
});

test("totales sin errores de centavos", () => {
  const list = [
    expense("ana", [[me, "pending", 0.1]]),
    expense("ana", [[me, "pending", 0.2]]),
    expense("ana", [[me, "sent", 5]]),
    expense(me, [[me, "confirmed"], ["ana", "pending", 1.1], ["leo", "sent", 2.2]])
  ];
  assert.deepEqual(expenseTotals(list, me), { toPay: 0.3, incoming: 3.3 });
});

test("nombres legibles", () => {
  assert.equal(namesList(["Samar"]), "Samar");
  assert.equal(namesList(["Samar", "Alan"]), "Samar y Alan");
  assert.equal(namesList(["Samar", "Alan", "Casey", "Monica"]), "Samar, Alan y 2 más");
});

test("cambiar el monto mantiene proporciones y la suma cuadra exacta", () => {
  const equal = Array.from({ length: 7 }, (_, index) => ({ personId: `p${index}`, amount: 443.57 }));
  equal[0].amount = 443.58;
  const scaled = scaleShares(equal, 3250);
  const cents = scaled.reduce((total, share) => total + Math.round(share.amount * 100), 0);
  assert.equal(cents, 325000);
  assert.ok(Math.max(...scaled.map((s) => s.amount)) - Math.min(...scaled.map((s) => s.amount)) <= 0.021);

  const custom = scaleShares([{ personId: "a", amount: 200 }, { personId: "b", amount: 100 }], 600);
  assert.deepEqual(custom.map((s) => s.amount), [400, 200]);
});
