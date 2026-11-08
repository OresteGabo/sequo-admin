import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAdminReference,
  readAdminReferences,
} from "../src/adminReferences.ts";
test("record choices use existing authenticated read routes and return only labels and IDs", async () => {
  const rows = await readAdminReferences("operatorUserId", async (path) => {
    assert.equal(path, "/api/admin/web/users");
    return [
      {
        id: "one",
        displayName: "Operator",
        status: "ACTIVE",
        accessToken: "never-display",
        phoneNumber: "private",
        roles: ["RELAY_PARTNER"],
      },
    ];
  });
  assert.deepEqual(rows, [{ id: "one", label: "Operator · ACTIVE" }]);
});
test("legacy known IDs remain enterable, unsupported fields never issue requests and failures are not empty choices", async () => {
  assert.equal(hasAdminReference("idempotencyKey"), false);
  await assert.rejects(
    readAdminReferences("idempotencyKey", () => assert.fail("No request")),
    /no record directory/,
  );
  await assert.rejects(
    readAdminReferences("merchantId", async () => ({})),
    /unavailable/,
  );
  await assert.rejects(
    readAdminReferences("merchantId", async () => [{ name: "No ID" }]),
    /unavailable/,
  );
  await assert.rejects(
    readAdminReferences("merchantId", async () => {
      throw new Error("offline");
    }),
    /offline/,
  );
  assert.deepEqual(await readAdminReferences("merchantId", async () => []), []);
});
