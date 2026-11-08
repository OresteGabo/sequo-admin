/* Runs against a same-origin fixture build. No provider, staging or production calls. */
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const assert = require("node:assert/strict");
const puppeteer = require("puppeteer-core");
let expired = false;
let deny = false;
let loseAcknowledgement = false;
let writes = 0;
let applied = 0;
let firstIntent;
let requestLog = [];
let workforce = "SequoSalaried";
const revision = "2026-11-08T08:00:00.123456Z";
const rider = () => ({
  id: "courier-fixture",
  userId: "rider-user",
  displayName: "Local fixture rider",
  status: "ACTIVE",
  workforceType: workforce,
  activeMissionCount: 0,
  updatedAt: applied ? "2026-11-08T08:01:00.123456Z" : revision,
});
const snapshot = {
  generatedAt: revision,
  merchantFulfillment: { sellerBacklog: 8, readyForPickup: 3 },
  deliveryCapacity: {
    activeMissions: 12,
    pausedCouriers: 0,
    problemMissions: [],
  },
  relayOperations: { delayedParcels: 0, problemParcels: 0 },
  returnBottlenecks: {
    returnsWaitingRelayAction: 1,
    returnsWaitingSequoCollection: 2,
    returnsInProblem: 0,
  },
  payoutQueue: { merchantPayoutCandidates: 2 },
};
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://fixture");
  if (!url.pathname.startsWith("/api/")) {
    const relative =
      url.pathname.startsWith("/assets/") || url.pathname.startsWith("/brand/")
        ? url.pathname.slice(1)
        : "index.html";
    const file = path.join(process.cwd(), "dist", relative);
    if (!fs.existsSync(file)) {
      res.statusCode = 404;
      res.end();
      return;
    }
    res.setHeader(
      "Content-Type",
      file.endsWith(".js")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".png")
            ? "image/png"
            : "text/html",
    );
    res.end(fs.readFileSync(file));
    return;
  }
  requestLog.push({ path: url.pathname, method: req.method });
  res.setHeader("Content-Type", "application/json");
  if (expired) {
    res.statusCode = 401;
    res.end('{"message":"Session expired"}');
    return;
  }
  const token = req.headers.authorization;
  let result = {};
  if (url.pathname === "/api/auth/me")
    result = {
      id: "admin-fixture",
      displayName: "Fixture operator",
      email: "operator@example.invalid",
      active: true,
      provider: "EMAIL",
      roles:
        token === "Bearer nonadmin" ? ["CUSTOMER"] : ["ADMIN", "SUPER_ADMIN"],
    };
  else if (url.pathname === "/api/admin-auth/development-access")
    result = { enabled: true, mode: "LOCAL_DEVELOPMENT" };
  else if (url.pathname === "/api/admin/web/overview")
    result = { totals: { orders: 148 } };
  else if (url.pathname === "/api/admin/monitoring/operations")
    result = snapshot;
  else if (url.pathname === "/api/admin/web/orders") result = [];
  else if (url.pathname === "/api/admin/web/couriers") result = [rider()];
  else if (url.pathname === "/api/admin/web/couriers/courier-fixture")
    result = {
      courier: rider(),
      payOverview: {},
      history: applied
        ? [{ actorUserId: "admin-fixture", reason: firstIntent.reason }]
        : [],
    };
  else if (url.pathname.endsWith("/workforce")) {
    assert.equal(token, "Bearer fixture-access");
    assert.equal(req.method, "PUT");
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    writes++;
    if (deny) {
      res.statusCode = 403;
      result = { message: "This role cannot change workforce" };
    } else {
      assert.equal(
        body.expectedUpdatedAt,
        revision,
        "Exact server precision is preserved",
      );
      assert.equal(body.workforceType, "Freelancer");
      if (firstIntent)
        assert.deepEqual(
          body,
          firstIntent,
          "A retry must preserve every original field and key",
        );
      else {
        firstIntent = body;
        workforce = "Freelancer";
        applied++;
      }
      if (loseAcknowledgement) {
        loseAcknowledgement = false;
        res.statusCode = 503;
        res.end('{"message":"The operation acknowledgement was interrupted"}');
        return;
      }
      result = {
        record: rider(),
        operation: { id: "one-operation", actorUserId: "admin-fixture" },
      };
    }
  } else {
    res.statusCode = 404;
    result = { message: "Fixture route not configured" };
  }
  res.end(JSON.stringify(result));
});
(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await puppeteer.launch({
    executablePath:
      process.env.CHROME_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  async function pageFor(token, width = 1440) {
    const context = await browser.createBrowserContext();
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.setViewport({ width, height: 1000 });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      request.url().startsWith(origin) ? request.continue() : request.abort(),
    );
    if (token)
      await page.evaluateOnNewDocument((token) => {
        sessionStorage.setItem("sequo_admin_access_token", token);
        sessionStorage.setItem("sequo_admin_refresh_token", "fixture-refresh");
      }, token);
    await page.goto(origin);
    return page;
  }
  async function clickText(page, selector, text) {
    await page.evaluate(
      (selector, text) => {
        const button = [...document.querySelectorAll(selector)].find(
          (element) => element.textContent.trim().includes(text),
        );
        if (!button) throw new Error(`Missing control: ${text}`);
        button.click();
      },
      selector,
      text,
    );
  }
  try {
    const anonymous = await pageFor(null, 390);
    await anonymous.waitForSelector(".auth-shell");
    assert.equal(await anonymous.$(".sidebar"), null);
    assert.equal(await anonymous.$(".nav-button"), null);
    assert.equal(
      await anonymous.$(".development-entry"),
      null,
      "Production bundle cannot expose development entry, even when a fixture claims enabled",
    );
    assert.equal(requestLog.length, 0, "No operational reads before sign-in");
    assert.ok(
      await anonymous.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    await anonymous.close();
    const outsider = await pageFor("nonadmin");
    await outsider.waitForSelector(".auth-shell .error-text");
    assert.equal(await outsider.$(".sidebar"), null);
    assert.equal(
      await outsider.evaluate(() =>
        sessionStorage.getItem("sequo_admin_access_token"),
      ),
      null,
    );
    assert.equal(
      requestLog.filter((request) => request.path.startsWith("/api/admin/web/"))
        .length,
      0,
    );
    await outsider.close();
    const page = await pageFor("fixture-access");
    await page.waitForSelector(".sidebar");
    await page.waitForFunction(
      () =>
        document.querySelector(".metric-card > strong")?.textContent === "148",
    );
    await page.keyboard.down("Control");
    await page.keyboard.press("k");
    await page.keyboard.up("Control");
    await page.waitForSelector(".command-dialog");
    assert.equal(
      await page.evaluate(() =>
        document.activeElement.getAttribute("aria-label"),
      ),
      "Find a workspace",
    );
    await page.type('[aria-label="Find a workspace"]', "Riders");
    await clickText(page, ".command-results button", "Riders");
    await page.waitForFunction(() =>
      document.body.innerText.includes("Local fixture rider"),
    );
    await clickText(page, ".resource-table button", "Manage");
    await page.select('[aria-label="Choose service action"]', "workforce");
    await page.evaluate(() => {
      const field = [...document.querySelectorAll(".action-form label")]
        .find((label) => label.textContent.includes("Workforce"))
        .querySelector("select");
      field.value = "Freelancer";
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.evaluate(() => {
      const field = [...document.querySelectorAll(".action-form label")]
        .find((label) => label.textContent.includes("Change reason"))
        .querySelector("textarea");
      field.value = "Recorded local fixture authorization";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickText(page, ".action-form button", "Review action");
    await page.waitForSelector(".confirm-dialog");
    assert.equal(
      await page.evaluate(() => document.activeElement.textContent.trim()),
      "Cancel",
    );
    await page.keyboard.down("Shift");
    await page.keyboard.press("Tab");
    await page.keyboard.up("Shift");
    assert.ok(
      await page.evaluate(() =>
        document.activeElement.textContent.includes("Confirm action"),
      ),
    );
    await clickText(page, ".confirm-dialog button", "Cancel");
    assert.equal(writes, 0);
    await clickText(page, ".action-form button", "Review action");
    loseAcknowledgement = true;
    await clickText(page, ".confirm-dialog button", "Confirm action");
    await page.waitForSelector(".pending-action-tools");
    assert.equal(writes, 1);
    assert.equal(applied, 1);
    await page.reload();
    await page.waitForSelector(".pending-action-tools");
    assert.equal(writes, 1, "Reload never replays a write");
    assert.ok(
      await page.$eval(
        ".action-form fieldset",
        (fieldset) => fieldset.disabled,
      ),
    );
    await clickText(page, ".pending-action-tools button", "Review exact retry");
    await clickText(page, ".confirm-dialog button", "Confirm action");
    await page.waitForFunction(() =>
      document.body.innerText.includes(
        "Action confirmed and current server records refreshed",
      ),
    );
    assert.equal(writes, 2);
    assert.equal(
      applied,
      1,
      "Server fixture canonical key produces one operation",
    );
    assert.equal(await page.$(".pending-action-tools"), null);
    assert.ok(
      await page.$eval(
        ".action-form fieldset",
        (fieldset) => fieldset.disabled,
      ),
      "Completed action does not expose a repeated tap",
    );
    await page.setViewport({ width: 390, height: 844 });
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "Compact workspace does not overflow",
    );
    await page.waitForFunction(
      () =>
        document.querySelector(".sidebar")?.getBoundingClientRect().right <= 1,
    );
    assert.ok(
      await page.$eval(
        ".sidebar",
        (sidebar) => sidebar.getBoundingClientRect().right <= 1,
      ),
      "Mobile navigation is closed by default",
    );
    await page.click('[aria-label="Open navigation"]');
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.ok(await page.$(".nav-scrim"));
    await page.click('[aria-label="Close navigation"]');
    await page.setViewport({ width: 1440, height: 1000 });
    await new Promise((resolve) => setTimeout(resolve, 250));
    await page.screenshot({
      path: "/tmp/sequo-admin-controls-desktop.png",
      fullPage: true,
    });
    // A forbidden mutation retains a verified admin session and shows the server's denial.
    const denied = await pageFor("fixture-access");
    await denied.waitForSelector(".sidebar");
    await clickText(denied, ".nav-button", "Riders");
    await denied.waitForFunction(() =>
      document.body.innerText.includes("Local fixture rider"),
    );
    await clickText(denied, ".resource-table button", "Manage");
    await denied.select('[aria-label="Choose service action"]', "workforce");
    await denied.evaluate(() => {
      const field = [...document.querySelectorAll(".action-form label")]
        .find((label) => label.textContent.includes("Change reason"))
        .querySelector("textarea");
      field.value = "Denied local test";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await clickText(denied, ".action-form button", "Review action");
    deny = true;
    await clickText(denied, ".confirm-dialog button", "Confirm action");
    await denied.waitForFunction(() =>
      document.body.innerText.includes("This role cannot change workforce"),
    );
    assert.ok(await denied.$(".sidebar"));
    assert.equal(applied, 1);
    expired = true;
    await clickText(
      denied,
      ".pending-action-tools button",
      "Refresh server records",
    );
    await denied.waitForSelector(".auth-shell");
    assert.equal(await denied.$(".sidebar"), null);
    assert.equal(
      await denied.evaluate(() =>
        Object.keys(sessionStorage).some((key) =>
          key.startsWith("sequo_admin_control_pending:"),
        ),
      ),
      false,
    );
    assert.deepEqual(errors, []);
    console.log(
      "PASS: sign-in isolation, production dev-entry exclusion, non-admin denial, real fixture counts, keyboard search, confirmation cancellation/focus trap, exact revision/key retry across reload, one recorded operation, completed-tap lock, mobile navigation/width, scoped403 and expired-session clearing. Local HTTP fixtures only.",
    );
  } finally {
    await browser.close();
    server.close();
    server.closeAllConnections();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  server.closeAllConnections();
  process.exitCode = 1;
});
