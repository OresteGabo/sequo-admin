import type { AdminControlField, AdminControlRequest } from "./adminControls";
import { isValidReference, normalizeReference, type PublicReferenceKind } from "./humanReference.ts";
export type AdminReference = { id: string; label: string; publicReference?: string };
export const adminReferenceKinds: Record<string, PublicReferenceKind> = {
  merchantId: "MERCHANT", ownerMerchantId: "MERCHANT", sellerId: "MERCHANT",
  userId: "USER", operatorUserId: "USER", ownerUserId: "USER", customerId: "USER",
  actorUserId: "USER", updatedByUserId: "USER", approvedByUserId: "USER",
  courierId: "COURIER", replacementCourierId: "COURIER", relayPointId: "RELAY", siteId: "RELAY",
  productId: "PRODUCT", orderId: "ORDER", missionId: "DELIVERY", deliveryMissionId: "DELIVERY",
  cooperativeId: "COOPERATIVE", manifestId: "GROUP", returnId: "RETURN", parcelId: "PARCEL",
  relayParcelId: "PARCEL", checkoutId: "CHECKOUT", subOrderId: "MERCHANT_ORDER",
  sourceOrderItemId: "MERCHANT_ORDER", merchantSubOrderId: "MERCHANT_ORDER", lockerId: "LOCKER", slotId: "LOCKER", threadId: "BARGAINING",
};
const knownReferences = new Map<string, string>();
const explicitLegacyTargets = new Set<string>();
const cacheKey = (name: string, id: string) => `${adminReferenceKinds[name]}:${id}`;
export function clearAdminReferenceCache() { knownReferences.clear(); explicitLegacyTargets.clear(); }
export function rememberLegacyReference(name: string, id: string) { if (hasAdminReference(name)) explicitLegacyTargets.add(cacheKey(name, id)); }
export function referenceForId(name: string, value: unknown): string {
  if (typeof value !== "string" || !hasAdminReference(name)) return "Reference unavailable";
  return knownReferences.get(cacheKey(name, value)) ?? (explicitLegacyTargets.has(cacheKey(name, value)) ? `Legacy ID: ${value}` : "Reference unavailable");
}
const endpoints: Record<string, string> = {
  merchantId: "/api/admin/web/merchants", ownerMerchantId: "/api/admin/web/merchants",
  userId: "/api/admin/web/users", operatorUserId: "/api/admin/web/users",
  courierId: "/api/admin/web/couriers", replacementCourierId: "/api/admin/web/couriers",
  relayPointId: "/api/admin/web/relay-sites", productId: "/api/catalog/products?includeArchived=true",
  orderId: "/api/admin/web/orders", missionId: "/api/delivery/missions",
  cooperativeId: "/api/admin/cooperatives", returnId: "/api/returns",
};
export const hasAdminReference = (name: string) => Object.hasOwn(adminReferenceKinds, name);
export async function readAdminReferences(name: string, request: AdminControlRequest): Promise<AdminReference[]> {
  if (!hasAdminReference(name)) throw new Error("This field has no record directory.");
  if (!Object.hasOwn(endpoints, name)) return [];
  const rows = await request<unknown>(endpoints[name]!);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || typeof row.id !== "string" || !row.id))
    throw new Error("The record directory is unavailable. Refresh and try again.");
  return rows.map(row => {
    const title = [row.name, row.displayName, row.deliveryCode, row.email].find(value => typeof value === "string" && value.trim());
    const ref = typeof row.publicReference === "string" && isValidReference(row.publicReference, adminReferenceKinds[name]) ? normalizeReference(row.publicReference)! : undefined;
    const status = typeof row.status === "string" ? row.status : typeof row.orderStatus === "string" ? row.orderStatus : "";
    if (ref) knownReferences.set(cacheKey(name, row.id as string), ref);
    return { id: row.id as string, label: [ref, title, status].filter(Boolean).join(" · ") || "Legacy record", ...(ref ? { publicReference: ref } : {}) };
  }).sort((a, b) => a.label.localeCompare(b.label));
}
export async function resolveAdminReference(name: string, input: string, request: AdminControlRequest, legacyId = false): Promise<Required<Pick<AdminReference, "id" | "publicReference">>> {
  const kind = adminReferenceKinds[name];
  if (!kind) throw new Error("This field has no supported reference type.");
  const value = input.trim();
  if (!legacyId && !isValidReference(value, kind)) throw new Error("Check the reference and its checksum before continuing.");
  if (legacyId && (!value || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value))) throw new Error("Enter a valid legacy ID.");
  const reference = legacyId ? value : normalizeReference(value)!;
  const result = await request<unknown>("/api/references/resolve", true, "POST", { kind, reference, legacyId });
  if (!result || typeof result !== "object") throw new Error("The reference could not be verified.");
  const row = result as Record<string, unknown>;
  if (row.kind !== kind || typeof row.id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(row.id) || typeof row.publicReference !== "string" || !isValidReference(row.publicReference, kind) ||
      (legacyId ? row.id !== value : normalizeReference(row.publicReference) !== reference)) throw new Error("The server returned a different record. Refresh before continuing.");
  knownReferences.set(cacheKey(name, row.id), normalizeReference(row.publicReference)!);
  return { id: row.id, publicReference: normalizeReference(row.publicReference)! };
}

const relationFields: Record<string, string[]> = {
  beforeValue: ["beforeReference"], afterValue: ["afterReference"], siteId: ["relayReference"], sourceOrderItemId: ["sourceOrderItemReference", "merchantOrderReference", "merchantSubOrderReference"], orderId: ["orderReference"], customerId: ["customerReference"], merchantId: ["merchantReference"], sellerId: ["merchantReference", "sellerReference"],
  ownerMerchantId: ["ownerMerchantReference", "merchantReference"], ownerUserId: ["ownerReference", "ownerUserReference"],
  userId: ["userReference"], collectingOperatorId: ["collectingOperatorReference"], receivingOperatorId: ["receivingOperatorReference"], inspectingOperatorId: ["inspectingOperatorReference"], requestedByUserId: ["requestedByReference", "actorReference"], reviewedByUserId: ["reviewedByReference", "reviewerReference", "actorReference"], sourceId: ["sourceReference"], entityId: ["entityReference"], aggregateId: ["aggregateReference"], actorUserId: ["actorReference"], updatedByUserId: ["actorReference", "updatedByReference"], approvedByUserId: ["approvedByReference", "actorReference"],
  courierId: ["courierReference"], operatorUserId: ["operatorReference"], relayPointId: ["relayReference", "relayPointReference"],
  productId: ["productReference"], deliveryMissionId: ["deliveryReference", "missionReference"], missionId: ["deliveryReference", "missionReference"],
  merchantSubOrderId: ["merchantOrderReference", "merchantSubOrderReference", "subOrderReference"], subOrderId: ["merchantOrderReference", "merchantSubOrderReference", "subOrderReference"],
  returnId: ["returnReference"], parcelId: ["parcelReference"], relayParcelId: ["parcelReference"],
  lockerId: ["lockerReference"], slotId: ["lockerReference"], checkoutId: ["checkoutReference"],
  cooperativeId: ["cooperativeReference", "groupReference"], manifestId: ["groupReference"], finalPackageId: ["packageReference"],
};
/** Display only. Never use the returned text in an API route, retry key or ownership check. */
export function referenceText(row: unknown, field = "id", fallback = "Reference unavailable"): string {
  if (!row || typeof row !== "object") return fallback;
  const data = row as Record<string, unknown>;
  const extraKinds: Record<string, PublicReferenceKind> = {
    finalPackageId: "PACKAGE", collectingOperatorId: "USER", receivingOperatorId: "USER", inspectingOperatorId: "USER", requestedByUserId: "USER", reviewedByUserId: "USER", beforeValue: "USER", afterValue: "USER",
  };
  const sourceKinds: Record<string, PublicReferenceKind> = { DeliveryMission: "DELIVERY", OrderItem: "MERCHANT_ORDER", MerchantSubOrder: "MERCHANT_ORDER", Order: "ORDER", ReturnRequest: "RETURN" };
  const expectedKind = adminReferenceKinds[field] ?? extraKinds[field] ?? (field === "sourceId" && typeof data.sourceType === "string" ? sourceKinds[data.sourceType] : undefined)
    ?? (field === "entityId" ? data.kind === "MERCHANT" ? "MERCHANT" : data.kind === "COURIER" ? "COURIER" : undefined : undefined);
  const candidates = [...(relationFields[field] ?? []), ...(["id", "checkoutId", "manifestId", "missionId", "subOrderId", "parcelId"].includes(field) ? ["publicReference"] : [])];
  for (const key of candidates) if (typeof data[key] === "string" && isValidReference(data[key], expectedKind)) return normalizeReference(data[key] as string)!;
  return data[field] === null || data[field] === undefined ? "—" : fallback;
}
const technicalDisplayFields = new Set([
  "relayLockerGridId", "operationId", "messageId", "idempotencyKey", "receiptIdempotencyKey",
  "refundIdempotencyKey", "collectionIdempotencyKey", "inspectionIdempotencyKey",
  "dispatchIdempotencyKey", "depositIdempotencyKey", "revision", "expectedRevision",
]);
function technicalDisplayField(row: Record<string, unknown>, key: string): boolean {
  if (technicalDisplayFields.has(key)) return true;
  // A provider's external event identity remains necessary for reconciliation. Outbox/custody
  // event UUIDs are local bookkeeping and must not be advertised as customer-facing references.
  if (key === "eventId") return !(typeof row.provider === "string" && typeof row.paymentReference === "string");
  return false;
}
export function humanRecordEntries(value: unknown): [string, unknown][] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const row = value as Record<string, unknown>;
  return Object.entries(row).filter(([key]) => key !== "id" && !technicalDisplayField(row, key));
}

/** Render declared ID relationships and nested response DTOs without exposing internal IDs. */
export function referenceDisplayValue(row: Record<string, unknown>, path: string): unknown {
  const parts = path.split("."); if (parts.some(key => ["__proto__", "prototype", "constructor"].includes(key))) return undefined; const field = parts.pop()!;
  let parent: unknown = row;
  for (const key of parts) parent = parent && typeof parent === "object" ? (parent as Record<string, unknown>)[key] : undefined;
  if (!parent || typeof parent !== "object") return undefined;
  const data = parent as Record<string, unknown>;
  if (technicalDisplayField(data, field)) return undefined;
  return field === "id" || hasAdminReference(field) || Object.hasOwn(relationFields, field) || field === "finalPackageId" || field === "deliveryCode" ? referenceText(data, field === "deliveryCode" ? "id" : field) : data[field];
}

export const referenceField = (name: string, label: string): AdminControlField => ({ name, label, type: "string", location: "body", required: true, maxLength: 128 });

/** Human-facing diagnostic projection only. Original wire/model values remain untouched. */
export function referenceDisplayTree(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(referenceDisplayTree);
  if (!value || typeof value !== "object") return value;
  const data = value as Record<string, unknown>;
  return Object.fromEntries(humanRecordEntries(data)
    .map(([key, item]) => [key, key === "id" || key === "deliveryCode" || hasAdminReference(key) || Object.hasOwn(relationFields, key)
      ? referenceText(data, key === "deliveryCode" ? "id" : key) : referenceDisplayTree(item)]));
}

export const referenceSearchQuery = (value: string) => (normalizeReference(value.trim()) ?? value.trim()).toLowerCase();
