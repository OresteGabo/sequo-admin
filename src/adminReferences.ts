import type { AdminControlRequest } from "./adminControls";
export type AdminReference = { id: string; label: string };
const endpoints: Record<string, string> = {
  merchantId: "/api/admin/web/merchants",
  ownerMerchantId: "/api/admin/web/merchants",
  userId: "/api/admin/web/users",
  operatorUserId: "/api/admin/web/users",
  courierId: "/api/admin/web/couriers",
  replacementCourierId: "/api/admin/web/couriers",
  relayPointId: "/api/admin/web/relay-sites",
  productId: "/api/catalog/products?includeArchived=true",
  orderId: "/api/admin/web/orders",
  missionId: "/api/delivery/missions",
  cooperativeId: "/api/admin/cooperatives",
  returnId: "/api/returns",
};
export const hasAdminReference = (name: string) =>
  Object.hasOwn(endpoints, name);
export async function readAdminReferences(
  name: string,
  request: AdminControlRequest,
): Promise<AdminReference[]> {
  if (!hasAdminReference(name))
    throw new Error("This field has no record directory.");
  const rows = await request<unknown>(endpoints[name]!);
  if (
    !Array.isArray(rows) ||
    rows.some(
      (row) =>
        !row ||
        typeof row !== "object" ||
        typeof row.id !== "string" ||
        !row.id,
    )
  )
    throw new Error(
      "The record directory is unavailable. Refresh or use a known record ID.",
    );
  return rows
    .map((row) => {
      const title =
        [row.name, row.displayName, row.deliveryCode, row.email].find(
          (value) => typeof value === "string" && value.trim(),
        ) || row.id;
      const status =
        typeof row.status === "string"
          ? row.status
          : typeof row.orderStatus === "string"
            ? row.orderStatus
            : "";
      return {
        id: row.id as string,
        label: [String(title), status].filter(Boolean).join(" · "),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}
