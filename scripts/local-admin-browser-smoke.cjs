/* Opt-in browser check of the isolated dev:local workspace. Never points at a remote service.
 * Read-only by default (apart from signing into the local fixture). Set
 * SEQUO_ADMIN_VERIFY_LOCAL_STORE=true to exercise one manual local fixture store.
 * No provider actions, real identities or financial records are created.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const root = path.resolve(__dirname, "..");
const evidence = process.env.SEQUO_ADMIN_EVIDENCE_DIR || "/tmp";
const puppeteer = require("puppeteer-core");
(async () => {
  const { adminControlCatalog, buildAdminControlRequest, readAdminControl } =
    await import(pathToFileURL(path.join(root, "src/adminControls.ts")).href);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(15000);
    await page.setViewport({ width: 1440, height: 1000 });
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle0" });
    await page.waitForSelector(".development-entry");
    assert.equal(await page.$(".sidebar"), null);
    await page.screenshot({
      path: path.join(evidence, "sequo-admin-sign-in-local.png"),
      fullPage: true,
    });
    await page.click(".development-button");
    await page.waitForSelector(".sidebar");
    await page.waitForFunction(() =>
      document.body.innerText.includes("Super administrator"),
    );
    const token = await page.evaluate(() =>
      sessionStorage.getItem("sequo_admin_access_token"),
    );
    const request = async (path, retry = true, method = "GET", body) => {
      assert.equal(method, "GET", "Directory smoke is read-only");
      const r = await fetch("http://127.0.0.1:55840" + path, {
        headers: {
          Origin: "http://127.0.0.1:5173",
          Authorization: "Bearer " + token,
          Accept: "application/json",
        },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    };
    const [me, merchants, products, couriers, relays, orders] =
      await Promise.all(
        [
          "/api/auth/me",
          "/api/admin/web/merchants",
          "/api/catalog/products?includeArchived=true",
          "/api/admin/web/couriers",
          "/api/admin/web/relay-sites",
          "/api/admin/web/orders",
        ].map((p) => request(p)),
      );
    const values = {
      userId: me.id,
      merchantId: merchants[0]?.id,
      productId: products[0]?.id,
      courierId: couriers[0]?.id,
      relayPointId: relays[0]?.id,
      orderId: orders[0]?.id,
    };
    assert.ok(
      me.email.endsWith("@fixture.invalid"),
      "Requires the generated local fixture identity",
    );
    const results = [];
    for (const control of adminControlCatalog) {
      if (!control.supported) {
        results.push({
          id: control.id,
          state: "DEPENDENCY",
          reason: control.reason,
        });
        continue;
      }
      try {
        buildAdminControlRequest(control.id, null, values);
      } catch {
        results.push({ id: control.id, state: "NO_MATCHING_LOCAL_RECORD" });
        continue;
      }
      try {
        const data = await readAdminControl(control.id, values, request);
        results.push({
          id: control.id,
          state: "READ_PASS",
          rows: data.rows.length,
        });
      } catch (e) {
        results.push({ id: control.id, state: "FAIL", reason: e.message });
      }
    }
    fs.writeFileSync(
      path.join(evidence, "sequo-admin-local-read-results.json"),
      JSON.stringify({ fixture: "ISOLATED_LOCAL_API", results }, null, 2),
    );
    console.log(
      "REAL API READS",
      JSON.stringify(
        results.map(({ id, state, rows, reason }) => ({
          id,
          state,
          rows,
          ...(state === "FAIL" ? { reason } : {}),
        })),
      ),
    );
    const failures = results.filter((r) => r.state === "FAIL");
    assert.deepEqual(failures, []);
    async function click(selector, text) {
      await page.evaluate(
        (selector, text) => {
          const element = [...document.querySelectorAll(selector)].find((e) =>
            e.textContent.includes(text),
          );
          if (!element) throw new Error("Missing " + text);
          element.click();
        },
        selector,
        text,
      );
    }
    const originalStore = merchants.length
      ? await request("/api/admin/web/merchants/" + merchants[0].id + "/store")
      : null;
    const eligibleStore =
      merchants[0]?.id === "merchant-chez-ramatou" &&
      originalStore?.open &&
      originalStore?.acceptingOrders &&
      originalStore?.canAcceptOrders &&
      !originalStore.openingHours.length &&
      !originalStore.temporaryExceptions.length &&
      !originalStore.temporaryClosure;
    if (
      process.env.SEQUO_ADMIN_VERIFY_LOCAL_STORE === "true" &&
      eligibleStore
    ) {
      await click(".nav-button", "Merchants");
      await page.waitForFunction(
        () => !!document.querySelector(".detail-card"),
      );
      await click(".detail-card button", "Manage store");
      await page.waitForSelector(".merchant-store-editor form");
      await page.select(".merchant-store-editor select", "Africa/Lome");
      async function saveStore(open, reason) {
        await page.evaluate(
          (open, reason) => {
            const editor = document.querySelector(".merchant-store-editor");
            const input = [...editor.querySelectorAll("label")]
              .find((l) => l.textContent.includes("Manually open"))
              .querySelector("input");
            input.checked = open;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            const text = editor.querySelector("textarea");
            text.value = reason;
            text.dispatchEvent(new Event("input", { bubbles: true }));
          },
          open,
          reason,
        );
        await click(".merchant-store-editor button", "Review store change");
        await page.waitForSelector(".change-preview");
        await page.click('.change-preview input[type="checkbox"]');
        await click(".change-preview button", "Confirm store change");
        await page.waitForFunction(() =>
          document
            .querySelector(".merchant-store-editor")
            ?.innerText.includes("Store change confirmed in server history"),
        );
      }
      await saveStore(false, "Local fixture verification: pause new orders");
      let saved = await request(
        "/api/admin/web/merchants/" + merchants[0].id + "/store",
      );
      assert.equal(saved.canAcceptOrders, false);
      assert.ok(saved.history.some((h) => h.actorUserId === me.id));
      await page.reload({ waitUntil: "networkidle0" });
      await page.waitForSelector(".sidebar");
      await page.waitForSelector(".detail-card");
      await click(".detail-card button", "Manage store");
      await page.waitForSelector(".merchant-store-editor form");
      saved = await request(
        "/api/admin/web/merchants/" + merchants[0].id + "/store",
      );
      assert.equal(saved.canAcceptOrders, false);
      await saveStore(true, "Local fixture verification: restore new orders");
      saved = await request(
        "/api/admin/web/merchants/" + merchants[0].id + "/store",
      );
      assert.equal(saved.canAcceptOrders, true);
      assert.ok(saved.history.length >= 2);
      await page.screenshot({
        path: path.join(evidence, "sequo-admin-store-local.png"),
        fullPage: true,
      });
    }
    await click(".nav-button", "Overview");
    await page.waitForFunction(() =>
      document.body.innerText.includes("Operations overview"),
    );
    await new Promise((r) => setTimeout(r, 500));
    await page.screenshot({
      path: path.join(evidence, "sequo-admin-overview-local.png"),
      fullPage: true,
    });
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((r) => setTimeout(r, 300));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await page.screenshot({
      path: path.join(evidence, "sequo-admin-overview-local-mobile.png"),
      fullPage: true,
    });
    assert.deepEqual(errors, []);
    console.log(
      "PASS actual local browser: passwordless entry, authenticated directories, desktop and mobile layouts; no provider action.",
    );
    console.log(
      process.env.SEQUO_ADMIN_VERIFY_LOCAL_STORE === "true" && eligibleStore
        ? "PASS local manual store pause/save/history/reload/restore"
        : "Store writes skipped (opt-in and eligible manual fixture store required).",
    );
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
