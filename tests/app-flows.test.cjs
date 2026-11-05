// Flujos del rediseño con datos inventados: Supabase está simulado y nada toca datos reales.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { chromium, devices } = require("playwright");

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
const env = readFileSync(join(__dirname, "../.env.local"), "utf8");
const apiURL = env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1].replace(/\/$/, "");
const storageKey = `sb-${new URL(apiURL).hostname.split(".")[0]}-auth-token`;
const me = "11111111-1111-4111-8111-111111111111";
const ana = "22222222-2222-4222-8222-222222222222";
const leo = "33333333-3333-4333-8333-333333333333";
const house = "44444444-4444-4444-8444-444444444444";
const user = { id: me, aud: "authenticated", email: "flows@example.invalid", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "t", refresh_token: "r", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const png = readFileSync(join(__dirname, "../public/icon-512.png"));

const expense = (id, title, paidBy, shares) => ({
  id: `55555555-5555-4555-8555-00000000000${id}`, title, category: "Casa", merchant: "", amount_cents: 9000, paid_by: paidBy, created_by: paidBy,
  purchased_at: "2026-10-01", created_at: "2026-10-01T12:00:00Z", note: null, receipt_path: id === 1 ? `${house}/r.png` : null,
  hidden_from_non_participants: false, archived_at: null, reimburses_expense_id: null,
  shares: shares.map(([profile_id, status, proof_path]) => ({ profile_id, amount_cents: 3000, status, proof_path: proof_path ?? null }))
});
const expenses = [
  expense(1, "Debo esta", ana, [[ana, "confirmed"], [me, "pending"]]),
  expense(2, "Pagué y falta Leo", ana, [[ana, "confirmed"], [me, "confirmed"], [leo, "pending"]]),
  expense(3, "Todos pagaron", ana, [[ana, "confirmed"], [me, "confirmed"], [leo, "confirmed"]]),
  expense(4, "Confirma Ana", me, [[me, "confirmed"], [ana, "sent"]]),
  expense(5, "No es mía", ana, [[ana, "confirmed"], [leo, "pending"]])
];
const thisMonth = new Date().toISOString().slice(0, 7);
const previous = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const rent = {
  id: "66666666-6666-4666-8666-666666666666", title: "Renta", due_day: 5, created_by: me, archived_at: null,
  created_at: `${previous}-01T12:00:00Z`,
  shares: [{ profile_id: me, amount_cents: 155250 }, { profile_id: ana, amount_cents: 155250 }],
  // Ana se atrasó el mes pasado; yo sí pagué: debo poder seguir con el mes actual.
  payments: [{ profile_id: me, period: previous, method: "transfer", proof_path: null, amount_cents: 155250, paid_at: `${previous}-02T00:00:00Z` }]
};
const rotation = {
  id: "77777777-7777-4777-8777-777777777777", title: "Basura", cadence: "Cada semana", icon: "trash", current_index: 0, created_at: "2026-01-01T00:00:00Z",
  hidden_from_non_participants: false, members: [{ profile_id: me, position: 0 }, { profile_id: ana, position: 1 }], history: []
};

let browser;
before(async () => { browser = await chromium.launch(); });
after(async () => { await browser.close(); });

async function app(run) {
  const context = await browser.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
  const writes = [];
  await context.addInitScript(({ storageKey, session }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey, session });
  await context.route(`${apiURL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    if (path.includes("/storage/v1/object/sign/") && request.method() === "GET") {
      return route.fulfill({ status: 200, contentType: "image/png", body: png });
    }
    let body = [];
    if (path.endsWith("/auth/v1/user")) body = user;
    else if (path.endsWith("/profiles")) body = { id: me, full_name: "Gandhi Prueba", color: "#0f9f7a" };
    else if (path.endsWith("/household_members")) {
      body = url.searchParams.has("profile_id")
        ? { role: "admin", household: { id: house, name: "Casa de prueba", invite_code: "TEST" } }
        : [
            { profile_id: me, role: "admin", profile: { full_name: "Gandhi Prueba" } },
            { profile_id: ana, role: "member", profile: { full_name: "Ana" } },
            { profile_id: leo, role: "member", profile: { full_name: "Leo" } }
          ];
    } else if (path.includes("/storage/v1/object/sign/")) body = { signedURL: "/object/sign/receipts/r.png?token=x" };
    else if (request.method() !== "GET" && request.method() !== "HEAD") {
      writes.push({ method: request.method(), path, query: url.search, body: request.postDataJSON?.() ?? null });
      body = [];
    } else if (path.endsWith("/expenses")) body = expenses;
    else if (path.endsWith("/recurring_bills")) body = [rent];
    else if (path.endsWith("/task_rotations")) body = [rotation];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(baseURL);
    await page.getByRole("button", { name: "Nuevo gasto", exact: true }).waitFor();
    await run({ page, writes, context });
    assert.deepEqual(errors, [], "Sin errores en el navegador");
  } finally {
    await context.close();
  }
}

const nav = (page, name) => page.getByRole("navigation").getByRole("button", { name, exact: true }).dispatchEvent("click");
const rowState = (page, title) => page.locator(".expense-card").filter({ hasText: title });

test("cada factura cae en su grupo y color", () => app(async ({ page }) => {
  await nav(page, "Gastos");
  await rowState(page, "Debo esta").locator(".stamp-pay").waitFor();
  assert.match(await rowState(page, "Debo esta").innerText(), /\$30\.00\s*Tu parte/);
  assert.equal(await rowState(page, "Confirma Ana").locator(".stamp-review").count(), 1);
  assert.equal(await rowState(page, "Pagué y falta Leo").locator(".stamp-paid").count(), 1);
  assert.match(await rowState(page, "Pagué y falta Leo").innerText(), /Faltan Leo/);
  assert.equal(await rowState(page, "Todos pagaron").count(), 0, "Completas empieza cerrada");
  await page.getByRole("button", { name: /^Completas/ }).click();
  assert.equal(await rowState(page, "Todos pagaron").locator(".stamp-done").count(), 1);
  await page.getByRole("button", { name: /^No participas/ }).click();
  assert.equal(await rowState(page, "No es mía").locator(".stamp-other").count(), 1);
}));

test("marcar pago en efectivo guarda la parte correcta", () => app(async ({ page, writes }) => {
  await nav(page, "Gastos");
  await rowState(page, "Debo esta").click();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page.getByRole("button", { name: "Marcar $30.00 pagado", exact: true }).click();
  await page.waitForFunction(() => true);
  await page.waitForTimeout(200);
  const update = writes.find((write) => write.path.endsWith("/expense_shares"));
  assert.equal(update.method, "PATCH");
  assert.equal(update.body.status, "sent");
  assert.equal(update.body.payment_method, "cash");
}));

test("pellizcar, arrastrar y doble toque acercan la factura", () => app(async ({ page, context }) => {
  await nav(page, "Gastos");
  await rowState(page, "Debo esta").click();
  await page.getByRole("button", { name: "Ver factura completa" }).click();
  const stage = page.locator(".zoom-stage");
  await stage.locator("img").waitFor();
  await page.waitForTimeout(350);
  const box = await stage.boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = (type, points) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: points });
  const scale = () => stage.locator("img").evaluate((img) => {
    const match = img.style.transform.match(/scale\(([\d.]+)\)/);
    return match ? Number(match[1]) : 1;
  });

  await touch("touchStart", [{ x: cx - 30, y: cy, id: 1 }, { x: cx + 30, y: cy, id: 2 }]);
  for (const gap of [45, 60, 80, 100]) {
    await touch("touchMove", [{ x: cx - gap, y: cy, id: 1 }, { x: cx + gap, y: cy, id: 2 }]);
  }
  await touch("touchEnd", []);
  const pinched = await scale();
  assert.ok(pinched > 2.5, `Pellizco acerca: ${pinched}`);

  const before = await stage.locator("img").evaluate((img) => img.style.transform);
  await touch("touchStart", [{ x: cx, y: cy, id: 1 }]);
  for (const dx of [20, 40, 60]) await touch("touchMove", [{ x: cx + dx, y: cy, id: 1 }]);
  await touch("touchEnd", []);
  assert.notEqual(await stage.locator("img").evaluate((img) => img.style.transform), before, "Arrastrar mueve la foto");

  await stage.dispatchEvent("dblclick", { clientX: cx, clientY: cy });
  assert.equal(await scale(), 1, "Doble toque vuelve al tamaño normal");
  await stage.dispatchEvent("dblclick", { clientX: cx, clientY: cy });
  assert.equal(await scale(), 2.5, "Doble toque acerca");
}));

test("cambiar monto guarda el nuevo total exacto", () => app(async ({ page, writes }) => {
  await nav(page, "Gastos");
  await page.getByRole("button", { name: /^Mensual/ }).click();
  await page.locator(".bill-main").click();
  await page.getByRole("button", { name: "Cambiar monto", exact: true }).click();
  await page.getByLabel("Nuevo total al mes").fill("3250");
  await page.getByRole("button", { name: "Guardar $3,250.00", exact: true }).click();
  await page.locator(".amount-field").waitFor({ state: "detached" });
  const inserted = writes.find((write) => write.method === "POST" && write.path.endsWith("/recurring_bill_shares"));
  assert.equal(inserted.body.reduce((total, share) => total + share.amount_cents, 0), 325000);
  assert.deepEqual(inserted.body.map((share) => share.amount_cents), [162500, 162500]);
}));

test("un atraso ajeno no me impide pagar el mes actual", () => app(async ({ page, writes }) => {
  await nav(page, "Gastos");
  await page.getByRole("button", { name: /^Mensual/ }).click();
  await page.getByText("Con meses atrasados: Ana").waitFor();
  await page.getByRole("button", { name: "Pagar mi parte", exact: true }).click();
  await page.getByRole("button", { name: "Efectivo", exact: true }).click();
  await page.getByRole("button", { name: "Marcar mi parte como pagada", exact: true }).click();
  await page.waitForTimeout(250);
  const payment = writes.find((write) => write.path.endsWith("/recurring_bill_payments"));
  assert.equal(payment.body.period, thisMonth);
  assert.equal(payment.body.profile_id, me);
}));

test("el turno se marca en un toque", () => app(async ({ page, writes }) => {
  await nav(page, "Turnos");
  await page.getByRole("button", { name: "Marcar hecho: Basura" }).click();
  await page.getByText(/Ahora le toca/).waitFor();
  assert.ok(writes.some((write) => write.path.endsWith("/rpc/complete_rotation")));
}));

test("reservar varios días crea una reserva por día", () => app(async ({ page, writes }) => {
  await nav(page, "Agenda");
  await page.getByRole("button", { name: "Reservar", exact: true }).click();
  await page.getByRole("button", { name: "Cocina", exact: true }).click();
  for (const day of ["Lunes", "Miércoles", "Viernes", "Domingo"]) {
    const button = page.locator(".day-picker").getByRole("button", { name: day, exact: true });
    if ((await button.getAttribute("aria-pressed")) === "false") await button.click();
  }
  const count = await page.locator(".day-picker button.active").count();
  await page.getByRole("button", { name: `Reservar ${count} días`, exact: true }).click();
  await page.locator(".schedule-form").waitFor({ state: "detached" });
  const saved = writes.filter((write) => write.path.endsWith("/schedule_slots"));
  assert.equal(saved.length, count);
  assert.ok(saved.every((write) => write.body.label === "Cocina"));
}));

test("Nuevo gasto abre el formulario desde Inicio y guarda", () => app(async ({ page, writes }) => {
  await page.getByRole("button", { name: "Nuevo gasto", exact: true }).click();
  await page.getByLabel("Total", { exact: true }).fill("45");
  await page.getByLabel("Título", { exact: true }).fill("Mercado");
  await page.getByRole("button", { name: "Crear gasto", exact: true }).click();
  await page.locator(".expense-form").waitFor({ state: "detached" });
  const created = writes.find((write) => write.path.endsWith("/expenses"));
  assert.equal(created.body.amount_cents, 4500);
  assert.equal(created.body.title, "Mercado");
}));
