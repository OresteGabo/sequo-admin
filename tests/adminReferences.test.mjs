import { encodeReference } from "../src/humanReference.ts";
import assert from "node:assert/strict";
import test from "node:test";
import {
  hasAdminReference,
  readAdminReferences, resolveAdminReference, referenceText, referenceDisplayValue, referenceDisplayTree, adminReferenceKinds, referenceForId, clearAdminReferenceCache, rememberLegacyReference, humanRecordEntries,
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

test("typed references validate checksum and kind offline before the authenticated resolver", async () => {
  for (const value of ["C12-345-6E7", "R98-765-4Q4", "wrong", "C12\u0000-345-6E6"]) {
    await assert.rejects(resolveAdminReference("orderId", value, () => assert.fail("Invalid input must not reach the server")), /checksum/);
  }
  assert.deepEqual(await resolveAdminReference("orderId", "c12 345 6e6", async (path, retry, method, body) => {
    assert.equal(path, "/api/references/resolve"); assert.equal(retry, true); assert.equal(method, "POST");
    assert.deepEqual(body, { kind: "ORDER", reference: "C12-345-6E6", legacyId: false });
    return { kind: "ORDER", id: "opaque-order", publicReference: "C12-345-6E6" };
  }), { id: "opaque-order", publicReference: "C12-345-6E6" });
});
test("resolver errors and mismatched replies never become a canonical operation target", async () => {
  for (const value of [{kind:"RETURN",id:"opaque",publicReference:"R98-765-4Q4"}, {kind:"ORDER",id:"opaque",publicReference:"C00-000-000"}, {kind:"ORDER",id:"",publicReference:"C12-345-6E6"}])
    await assert.rejects(resolveAdminReference("orderId", "C12-345-6E6", async () => value), /different record/);
  await assert.rejects(resolveAdminReference("orderId", "C12-345-6E6", async () => { throw Error("expired session"); }), /expired session/);
  assert.equal(adminReferenceKinds.cooperativeId, "COOPERATIVE");
  assert.equal(adminReferenceKinds.subOrderId, "MERCHANT_ORDER");
});
test("directory and display labels use only server-issued references while machine IDs stay exact", async () => {
  const rows = await readAdminReferences("orderId", async () => [{id:"opaque-order",publicReference:"C12-345-6E6",status:"DELIVERED"}]);
  assert.deepEqual(rows, [{id:"opaque-order",publicReference:"C12-345-6E6",label:"C12-345-6E6 · DELIVERED"}]);
  const row = {id:"opaque-order",publicReference:"C12-345-6E6",customerId:"opaque-user",customerReference:"A12-345-6BJ",paymentReference:"PROVIDER-EXACT",idempotencyKey:"retry-exact"};
  assert.equal(referenceText(row), "C12-345-6E6"); assert.equal(referenceText(row,"customerId"),"A12-345-6BJ");
  assert.equal(referenceDisplayValue(row,"customerId"),"A12-345-6BJ");
  assert.equal(referenceText({id:"legacy-only"}),"Reference unavailable");
  assert.equal(referenceDisplayTree(row).id,undefined);
  assert.equal(referenceDisplayTree(row).publicReference,"C12-345-6E6");
  assert.equal(referenceDisplayTree(row).paymentReference,"PROVIDER-EXACT");
  assert.equal(referenceDisplayTree(row).idempotencyKey,undefined);
  assert.equal(row.id,"opaque-order"); assert.equal(row.idempotencyKey,"retry-exact");
});

test("confirmation labels use verified server references and forget prior session labels", async () => {
  clearAdminReferenceCache();
  assert.equal(referenceForId("orderId", "opaque-order"), "Reference unavailable");
  await resolveAdminReference("orderId", "C12-345-6E6", async () => ({kind:"ORDER",id:"opaque-order",publicReference:"C12-345-6E6"}));
  assert.equal(referenceForId("orderId", "opaque-order"), "C12-345-6E6");
  assert.equal(referenceForId("returnId", "opaque-order"), "Reference unavailable");
  rememberLegacyReference("orderId", "old:order");
  assert.equal(referenceForId("orderId", "old:order"), "Legacy ID: old:order");
  clearAdminReferenceCache();
  assert.equal(referenceForId("orderId", "opaque-order"), "Reference unavailable");
  assert.equal(referenceForId("orderId", "old:order"), "Reference unavailable");
  assert.equal(referenceText({sourceOrderItemId:"sub-1",sourceOrderItemReference:"MAB-CDE-FJZ"},"sourceOrderItemId"),"MAB-CDE-FJZ");
});

test("named relationships never borrow a primary reference of a different entity kind", () => {
  const ledger = { id:"entry-1",publicReference:"W00-000-000",missionId:"mission-1" };
  // Use an actually valid LEDGER reference rather than relying on an invalid fixture.
  ledger.publicReference = encodeReference("LEDGER", "000000");
  assert.equal(referenceText(ledger,"missionId"),"Reference unavailable");
  const order = {id:"order-1",publicReference:"C12-345-6E6",checkoutId:"checkout-1"};
  assert.equal(referenceText(order,"checkoutId"),"Reference unavailable");
  assert.equal(referenceText({...order,checkoutReference:"C12-345-6E6"},"checkoutId"),"Reference unavailable");
  assert.equal(referenceText({...order,checkoutReference:"H00-000-0TP"},"checkoutId"),"H00-000-0TP");
  assert.equal(referenceText({id:"order-1",publicReference:"C12-345-6E6",checkoutId:null},"checkoutId"),"—");
});

test("advanced human details omit internal audit keys but retain external evidence and actor history", () => {
  const custody = {id:"internal-audit-row",operationId:"operation-uuid",eventId:"custody-event-uuid",relayLockerGridId:"grid-uuid",idempotencyKey:"retry-uuid",revision:"opaque-revision",action:"RELAY_DROPOFF_RECORDED",actorUserId:"actor-id",actorReference:"A12-345-6BJ",createdAt:"2026-11-09T00:00:00Z",metadata:"Physical receipt checked"};
  const display = referenceDisplayTree(custody);
  for (const key of ["id","operationId","eventId","relayLockerGridId","idempotencyKey","revision"]) assert.equal(Object.hasOwn(display,key),false,key);
  assert.equal(display.action,"RELAY_DROPOFF_RECORDED");assert.equal(display.actorUserId,"A12-345-6BJ");assert.equal(display.createdAt,custody.createdAt);assert.equal(display.metadata,custody.metadata);
  assert.equal(referenceDisplayValue(custody,"operationId"),undefined);
  assert.equal(humanRecordEntries(custody).some(([key])=>key==="eventId"),false);
  const provider={id:"internal-callback-row",provider:"YAS",eventId:"EXTERNAL-PROVIDER-EVENT",paymentReference:"EXTERNAL-PAYMENT",providerReference:"EXTERNAL-ACCOUNT-REFERENCE",status:"PENDING"};
  const external=referenceDisplayTree(provider);assert.equal(external.eventId,provider.eventId);assert.equal(external.paymentReference,provider.paymentReference);assert.equal(external.providerReference,provider.providerReference);
  const proof={rawPin:"123456",qrNonce:"test-qr-value",lockerCode:"A-1",metadata:"Received"};assert.deepEqual(referenceDisplayTree(proof),proof);
  assert.equal(custody.id,"internal-audit-row");assert.equal(custody.eventId,"custody-event-uuid");assert.equal(custody.idempotencyKey,"retry-uuid");
});

test("merchant preparation displays the authoritative M reference rather than the retained legacy sub-order code", () => {
  const row = {id:"persisted-sub-order-id",subOrderCode:"SQ-legacy-internal-derived-code",publicReference:"MAB-CDE-FJZ",orderId:"parent-order-id",orderReference:"C12-345-6E6"};
  assert.equal(referenceDisplayValue(row,"subOrderCode"),"MAB-CDE-FJZ");
  assert.equal(referenceDisplayTree(row).subOrderCode,"MAB-CDE-FJZ");
  assert.equal(referenceDisplayValue({...row,publicReference:"C12-345-6E6"},"subOrderCode"),"Reference unavailable");
  assert.equal(row.subOrderCode,"SQ-legacy-internal-derived-code");assert.equal(row.id,"persisted-sub-order-id");
});

test("a DeliveryMission ledger source uses its actual D relation without borrowing its W entry identity", () => {
  const ledger = {id:"ledger-entry",publicReference:encodeReference("LEDGER","000000"),sourceId:"mission-id",sourceType:"DeliveryMission",missionReference:"DZ9-X8W-7P3"};
  assert.equal(referenceText(ledger,"sourceId"),"DZ9-X8W-7P3");
  assert.equal(referenceText({...ledger,missionReference:ledger.publicReference},"sourceId"),"Reference unavailable");
  assert.equal(referenceText({...ledger,sourceType:"ImportedUnknown",sourceReference:ledger.publicReference},"sourceId"),"Reference unavailable");
  assert.equal(referenceText({...ledger,sourceType:"OrderItem"},"sourceId"),"Reference unavailable");
  assert.equal(ledger.sourceId,"mission-id");
});
test("mission proof actors and replacement courier use the corresponding typed server reference only", () => {
  const mission = {pickupProofActorId:"pickup-user-id",pickupProofActorReference:"A12-345-6BJ",dropoffProofActorId:"dropoff-user-id",dropoffProofActorReference:"A12-345-6BJ",replacementCourierId:"replacement-profile-id",replacementCourierReference:"TZ9-X8W-791"};
  assert.equal(referenceDisplayValue(mission,"pickupProofActorId"),"A12-345-6BJ");
  assert.equal(referenceDisplayValue(mission,"dropoffProofActorId"),"A12-345-6BJ");
  assert.equal(referenceDisplayValue(mission,"replacementCourierId"),"TZ9-X8W-791");
  assert.equal(referenceDisplayValue({...mission,pickupProofActorReference:"TZ9-X8W-791"},"pickupProofActorId"),"Reference unavailable");
  assert.equal(referenceDisplayValue({...mission,replacementCourierReference:"A12-345-6BJ"},"replacementCourierId"),"Reference unavailable");
  assert.equal(mission.pickupProofActorId,"pickup-user-id");assert.equal(mission.replacementCourierId,"replacement-profile-id");
});
