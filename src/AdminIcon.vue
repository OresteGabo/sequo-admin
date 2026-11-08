<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ name: string; size?: number }>();
const icons: Record<string, string> = {
  dashboard: "M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z",
  receipt_long: "M6 3h12v19l-3-2-3 2-3-2-3 2zM9 7h6M9 11h6M9 15h4",
  local_shipping:
    "M3 6h11v11H3zM14 10h4l3 4v3h-7M5 17a2 2 0 1 0 4 0M16 17a2 2 0 1 0 4 0",
  storefront:
    "M4 10v11h16V10M3 10l2-7h14l2 7M3 10q2 4 5 0 4 4 8 0 3 4 5 0M9 21v-7h6v7",
  groups:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  inventory_2: "M3 3h18v5H3zM5 8v13h14V8M10 12h4",
  catalog: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  payments: "M3 5h18v14H3zM3 9h18M7 14h3",
  account_balance_wallet:
    "M20 7H5a2 2 0 0 1 0-4h13v4M3 5v14a2 2 0 0 0 2 2h15V7M16 12h5v5h-5z",
  percent:
    "M19 5 5 19M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8",
  assignment_return: "M9 4H5v17h14V4h-4M9 3h6v4H9zM9 11l-3 3 3 3M6 14h9",
  tune: "M4 4v5M4 15v5M12 4v10M12 20v0M20 4v0M20 10v10M1 10h6v5H1zM9 14h6v5H9zM17 5h6v5h-6z",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4",
  refresh: "M20 4v6h-6M4 20v-6h6M20 10a8 8 0 0 0-14-5M4 14a8 8 0 0 0 14 5",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15M16 16l5 5",
  arrow_forward: "M4 12h16M14 6l6 6-6 6",
  chevron_right: "M9 5l7 7-7 7",
  expand_more: "M5 9l7 7 7-7",
  close: "M6 6l12 12M6 18 18 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  logout: "M9 3H4v18h5M13 8l5 4-5 4M8 12h13",
  shield: "M12 2 3 6v6c0 6 9 10 9 10s9-4 9-10V6zM8 12l3 3 5-6",
  lock: "M6 10h12v11H6zM8 10V6a4 4 0 0 1 8 0v4M12 14v3",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  phone: "M7 2h10v20H7zM10 18h4",
  check: "M5 12l4 4L19 6",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 6v6l4 2",
  activity: "M2 12h4l3-8 6 16 3-8h4",
  riders:
    "M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4M5 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8M19 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8M5 17l5-8h4l5 8M10 9l3 8H5M15 8h3",
  negotiations: "M3 3h18v13H9l-6 5zM7 7h10M7 11h6",
  cooperatives: "M3 21v-9h6v9M15 21v-9h6v9M9 21V3h6v18M11 7h2M11 11h2M11 15h2",
  benefits:
    "M3 8h18v4H3zM5 12v9h14v-9M12 8v13M12 8H8a3 3 0 1 1 3-3zM12 8h4a3 3 0 1 0-3-3z",
  audit: "M5 3h14v18H5zM9 7h6M9 11h6M9 15h3",
  download: "M12 3v12M7 10l5 5 5-5M4 16v5h16v-5",
  calendar: "M4 5h16v16H4zM8 2v6M16 2v6M4 10h16",
  globe:
    "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c6 6 6 14 0 20-6-6-6-14 0-20",
  warning: "M12 3 2 21h20zM12 9v5M12 17v1",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 10v7M12 6v1",
  help: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17v1",
  external: "M14 3h7v7M21 3l-9 9M10 3H3v18h18v-7",
};
const aliases: Record<string, string> = {
  admin_panel_settings: "shield",
  pending_actions: "clock",
  package_2: "inventory_2",
  phonelink_lock: "phone",
  password: "lock",
  mail_lock: "mail",
  outgoing_mail: "mail",
  alternate_email: "mail",
  login: "arrow_forward",
  account_circle: "groups",
  check_circle: "check",
  arrow_right_alt: "arrow_forward",
  history: "audit",
  bolt: "activity",
};
const path = computed(
  () => icons[aliases[props.name] ?? props.name] ?? icons.info,
);
</script>

<template>
  <svg
    class="admin-icon"
    :width="size ?? 20"
    :height="size ?? 20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.65"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="path" />
  </svg>
</template>
