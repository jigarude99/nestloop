const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { chromium, webkit, devices } = require("playwright");

const baseURL = process.env.TEST_BASE_URL || "http://localhost:3000";
const env = readFileSync(join(__dirname, "../.env.local"), "utf8");
const apiURL = env.match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)[1].replace(/\/$/, "");
const storageKey = `sb-${new URL(apiURL).hostname.split(".")[0]}-auth-token`;
const userId = "11111111-1111-4111-8111-111111111111";
const otherId = "22222222-2222-4222-8222-222222222222";
const houseId = "33333333-3333-4333-8333-333333333333";
const expenseId = "44444444-4444-4444-8444-444444444444";
const locationKey = `nestloop:location:v1:${houseId}:${userId}`;
const user = { id: userId, aud: "authenticated", email: "mobile-test@example.invalid",
  app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
const session = { access_token: "test-token", refresh_token: "test-refresh", token_type: "bearer",
  expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user };
const expense = { id: expenseId, title: "Telefono de prueba", category: "Servicios", merchant: "",
  amount_cents: 6000, paid_by: otherId, created_by: userId, purchased_at: "2026-11-01",
  created_at: "2026-11-01T12:00:00Z", receipt_path: `${houseId}/${expenseId}/receipt.png`,
  shares: [
    { profile_id: userId, amount_cents: 3000, status: "pending" },
    { profile_id: otherId, amount_cents: 3000, status: "confirmed" }
  ] };

async function fixture(browser, device, run) {
  const context = await browser.newContext({ ...devices[device], serviceWorkers: "block" });
  const writes = [];
  await context.addInitScript(({ storageKey, session }) => {
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify(session));
  }, { storageKey, session });
  await context.route(`${apiURL}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let body = [];
    if (url.pathname.endsWith("/auth/v1/user")) body = user;
    else if (url.pathname.endsWith("/profiles")) body = { id: userId, full_name: "Gandhi Test", color: "#0f9f7a" };
    else if (url.pathname.endsWith("/household_members")) {
      body = url.searchParams.has("profile_id")
        ? { role: "admin", household: { id: houseId, name: "Casa de prueba", invite_code: "TEST" } }
        : [
          { profile_id: userId, role: "admin", profile: { full_name: "Gandhi Test" } },
          { profile_id: otherId, role: "member", profile: { full_name: "Adriana Test" } }
        ];
    } else if (url.pathname.endsWith("/expenses")) body = [expense];
    else if (url.pathname.includes("/storage/v1/object/sign/")) body = { signedURL: `${baseURL}/icon-192.png` };
    else if (request.method() !== "GET") writes.push(`${request.method()} ${url.pathname}`);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    await page.goto(baseURL);
    await page.getByRole("button", { name: "Nuevo gasto", exact: true }).waitFor();
    await run({ page, context });
    assert.deepEqual(writes, [], "Navigation must not write family data");
    assert.deepEqual(errors, [], "No browser runtime errors");
  } finally {
    await context.close();
  }
}

async function openExpense(page) {
  await page.getByRole("navigation").getByRole("button", { name: "Gastos", exact: true }).click();
  await page.locator(".expense-card").filter({ hasText: "Telefono de prueba" }).click();
  await page.locator(".detail-sheet").waitFor();
}

async function emitAuth(context, page, event, activeSession = session) {
  const sender = await context.newPage();
  await sender.goto(baseURL);
  await sender.getByRole("button", { name: "Mi perfil", exact: true }).waitFor();
  await sender.evaluate(({ storageKey, event, activeSession }) => {
    if (event === "SIGNED_OUT") localStorage.removeItem(storageKey);
    const channel = new BroadcastChannel(storageKey);
    channel.postMessage({ event, session: activeSession });
    setTimeout(() => channel.close(), 500);
  }, { storageKey, event, activeSession });
  await page.bringToFront();
  await page.waitForTimeout(650);
  await sender.close();
}

for (const [platform, browserType, device] of [
  ["Android / Chromium", chromium, "Pixel 7"],
  ["iPhone / WebKit", webkit, "iPhone 14"]
]) {
  test(platform, { timeout: 120_000 }, async (t) => {
    const browser = await browserType.launch();
    try {
      await t.test("resume preserves the same expense and draft fields", () => fixture(browser, device, async ({ page, context }) => {
        await openExpense(page);
        await emitAuth(context, page, "SIGNED_IN");
        assert.equal(await page.locator(".detail-sheet").count(), 1);
        await page.getByRole("button", { name: "Editar", exact: true }).click();
        const title = page.getByLabel("Título", { exact: true });
        await title.fill("Borrador que debe seguir abierto");
        await page.locator('.expense-form input[type="file"]').setInputFiles({
          name: "comprobante-de-prueba.png", mimeType: "image/png", buffer: Buffer.from("test-image")
        });
        await title.evaluate((element) => { window.__originalDraftField = element; });
        await emitAuth(context, page, "SIGNED_IN");
        await emitAuth(context, page, "TOKEN_REFRESHED");
        assert.equal(await title.inputValue(), "Borrador que debe seguir abierto");
        assert.equal(await title.evaluate((element) => element === window.__originalDraftField), true);
        assert.equal(await page.locator(".photo-picker-head").innerText(), "comprobante-de-prueba.png");
      }));

      await t.test("reload and a new launch restore the expense and section", () => fixture(browser, device, async ({ page, context }) => {
        await openExpense(page);
        await page.reload();
        await page.locator(".detail-sheet").waitFor();
        assert.equal(await page.locator(".detail-sheet h2").innerText(), "Telefono de prueba");
        await page.close();
        const relaunched = await context.newPage();
        await relaunched.goto(baseURL);
        await relaunched.locator(".detail-sheet").waitFor();
        await relaunched.getByRole("button", { name: "Cerrar", exact: true }).click();
        await relaunched.locator(".detail-sheet").waitFor({ state: "detached" });
        assert.equal(await relaunched.locator(".expense-card").count(), 1);
      }));

      await t.test("Back closes the photo, then the expense, in that order", () => fixture(browser, device, async ({ page }) => {
        await openExpense(page);
        await page.getByRole("button", { name: "Ver factura completa" }).click();
        await page.locator(".photo-sheet").waitFor();
        await page.goBack();
        await page.locator(".photo-sheet").waitFor({ state: "detached" });
        assert.equal(await page.locator(".detail-sheet").count(), 1);
        await page.goBack();
        await page.locator(".detail-sheet").waitFor({ state: "detached" });
        assert.equal(await page.locator(".expense-card").count(), 1);
      }));

      await t.test("Back dismisses the focused keyboard before closing a form", () => fixture(browser, device, async ({ page }) => {
        await page.getByRole("button", { name: "Nuevo gasto", exact: true }).click();
        const title = page.getByLabel("Título", { exact: true });
        await title.fill("Texto conservado");
        await page.goBack();
        await page.waitForFunction(() => document.activeElement?.tagName !== "INPUT");
        assert.equal(await title.inputValue(), "Texto conservado");
        await page.goBack();
        await page.locator(".expense-form").waitFor({ state: "detached" });
      }));

      await t.test("keyboard resize and a stray backdrop click preserve the form", () => fixture(browser, device, async ({ page }) => {
        await page.getByRole("button", { name: "Nuevo gasto", exact: true }).click();
        const title = page.getByLabel("Título", { exact: true });
        await title.fill("Teclado cerrado");
        await page.evaluate(() => {
          const originalHeight = window.visualViewport.height;
          let height = originalHeight - 300;
          Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => height });
          window.visualViewport.dispatchEvent(new Event("resize"));
          height = originalHeight;
          window.visualViewport.dispatchEvent(new Event("resize"));
          history.back();
        });
        await page.waitForTimeout(120);
        await page.locator(".modal-backdrop").dispatchEvent("click");
        assert.equal(await title.inputValue(), "Teclado cerrado");
        const output = join(tmpdir(), "nestloop-mobile-navigation");
        mkdirSync(output, { recursive: true });
        await page.screenshot({ path: join(output, `${device.replaceAll(" ", "-")}.png`) });
      }));

      await t.test("replacing a sheet does not make Back close the wrong window", () => fixture(browser, device, async ({ page }) => {
        await openExpense(page);
        await page.getByRole("button", { name: "Editar", exact: true }).click();
        await page.locator(".expense-form").waitFor();
        await page.goBack();
        await page.locator(".expense-form").waitFor({ state: "detached" });
        assert.equal(await page.locator(".expense-card").count(), 1);
      }));

      await t.test("explicit notification links override the saved location", () => fixture(browser, device, async ({ page }) => {
        await page.getByRole("navigation").getByRole("button", { name: "Agenda", exact: true }).click();
        await page.goto(`${baseURL}/?view=expenses&expense=${expenseId}`);
        await page.locator(".detail-sheet").waitFor();
        assert.equal(new URL(page.url()).search, "");
      }));

      await t.test("saved subtabs survive reload and inaccessible invoices fall back safely", () => fixture(browser, device, async ({ page }) => {
        await page.getByRole("navigation").getByRole("button", { name: "Gastos", exact: true }).click();
        await page.getByRole("button", { name: /^Mensual/ }).click();
        await page.reload();
        await page.getByRole("button", { name: "Agregar mensual", exact: true }).waitFor();
        await page.evaluate(({ locationKey }) => {
          localStorage.setItem(locationKey, JSON.stringify({ view: "expenses", expensesTab: "expenses", expenseId: "deleted-expense" }));
        }, { locationKey });
        await page.reload();
        await page.locator(".expense-card").waitFor();
        await page.waitForFunction(({ locationKey }) => JSON.parse(localStorage.getItem(locationKey)).expenseId === null, { locationKey });
        assert.equal(await page.locator(".detail-sheet").count(), 0);
      }));

      await t.test("sign out removes private windows", () => fixture(browser, device, async ({ page, context }) => {
        await openExpense(page);
        await emitAuth(context, page, "SIGNED_OUT", null);
        await page.getByRole("heading", { name: "Entrar a tu casa" }).waitFor();
        assert.equal(await page.locator(".detail-sheet").count(), 0);
      }));
    } finally {
      await browser.close();
    }
  });
}
