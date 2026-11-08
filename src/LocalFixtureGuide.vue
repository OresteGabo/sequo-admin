<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { AdminControlRequest } from './adminControls'
import { readLocalFixtures, type FixtureScenario, type LocalFixtureManifest } from './localFixtures'
const props = defineProps<{ request: AdminControlRequest; actorId?: string }>()
const emit = defineEmits<{ navigate: [category: FixtureScenario['category'], resourceIds: Record<string, string>] }>()
const manifest = ref<LocalFixtureManifest | null>(null)
const busy = ref(false)
const error = ref('')
const copied = ref('')
const search = ref('')
const category = ref('ALL')
const categories = computed(() => [...new Set(manifest.value?.scenarios.map(scenario => scenario.category) ?? [])].sort())
const scenarios = computed(() => {
  const query = search.value.trim().toLowerCase()
  return (manifest.value?.scenarios ?? []).filter(scenario => (category.value === 'ALL' || scenario.category === category.value) && (!query || [scenario.title, scenario.summary, scenario.category, ...Object.values(scenario.resourceIds), ...scenario.nextActions].join(' ').toLowerCase().includes(query)))
})
let generation = 0
onUnmounted(() => { generation++ })
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())
async function refresh() {
  if (busy.value) return
  const version = generation
  busy.value = true; error.value = ''; manifest.value = null
  try { const result = await readLocalFixtures(props.request); if (version === generation) { manifest.value = result; if (category.value !== 'ALL' && !categories.value.includes(category.value as FixtureScenario['category'])) category.value = 'ALL' } }
  catch (caught) { if (version === generation) error.value = caught instanceof Error ? caught.message : 'Local scenarios could not be read. Refresh to try again.' }
  finally { if (version === generation) busy.value = false }
}
async function copy(value: string, name: string) {
  try { await navigator.clipboard.writeText(value); copied.value = `${name} copied.` }
  catch { copied.value = 'Copy is unavailable in this browser. Select the displayed local value to copy it.' }
}
watch(() => props.actorId, () => { generation++; busy.value = false; manifest.value = null; copied.value = ''; search.value = ''; category.value = 'ALL'; void refresh() }, { immediate: true })
</script>
<template>
  <section class="panel local-fixture-guide" aria-label="Local scenario guide">
    <header class="fixture-heading"><div><span class="eyebrow">LOCAL FIXTURE · NO REAL PAYMENTS</span><h2>Practice the operations</h2><p>Named local accounts and recorded scenarios from this isolated database.</p></div><button class="secondary" type="button" :disabled="busy" @click="refresh">{{ busy ? 'Reading scenarios…' : 'Refresh guide' }}</button></header>
    <p v-if="error" class="error-text" role="alert">{{ error }}</p>
    <p v-if="busy" role="status">Reading the guarded local fixture manifest…</p>
    <template v-if="manifest">
      <p>{{ manifest.note }}</p>
      <p v-if="!manifest.seededAt">Scenarios are not installed yet. In a separate terminal in sequo-admin, run <code>npm run dev:fixtures</code>, then refresh this guide. Existing data is retained.</p>
      <template v-else>
        <p class="subtle">Installed {{ new Date(manifest.seededAt).toLocaleString() }} · {{ manifest.scenarios.length }} scenarios · Changes you make remain saved; refreshing does not reset them.</p>
        <details class="fixture-accounts"><summary>Named local accounts ({{ manifest.accounts.length }})</summary><div class="fixture-account-grid"><article v-for="account in manifest.accounts" :key="account.id"><h3>{{ account.name }}</h3><p>{{ account.purpose }}</p><p>{{ account.roles.map(label).join(' · ') }}</p><small>{{ account.email }}</small><div class="fixture-value"><code>{{ account.id }}</code><button class="text-button" type="button" @click="copy(account.id, account.name + ' ID')">Copy ID</button></div></article></div></details>
        <details class="fixture-browse"><summary>Browse practice scenarios ({{ manifest.scenarios.length }})</summary><p class="subtle">Descriptions and proof values describe the original seed. Check each current record before acting; refreshing this guide preserves your edits and never issues new codes.</p><div class="fixture-filters"><label>Find a scenario<input v-model="search" type="search" aria-label="Search practice scenarios" placeholder="Search names, steps or record IDs…" /></label><label>Category<select v-model="category" aria-label="Filter practice category"><option value="ALL">All categories</option><option v-for="item in categories" :key="item" :value="item">{{ label(item) }}</option></select></label></div><p class="subtle" role="status">{{ scenarios.length }} {{ scenarios.length === 1 ? 'scenario' : 'scenarios' }}</p><p v-if="!scenarios.length">No scenarios match these filters.</p><div class="fixture-scenarios"><article v-for="scenario in scenarios" :key="scenario.id" class="fixture-scenario"><div class="fixture-heading"><h3>{{ scenario.title }}</h3><span class="period-chip">{{ label(scenario.category) }}</span></div><p>{{ scenario.summary }}</p><ol v-if="scenario.nextActions.length"><li v-for="(action, index) in scenario.nextActions" :key="index">{{ action }}</li></ol><dl v-if="Object.keys(scenario.resourceIds).length"><div v-for="(value, name) in scenario.resourceIds" :key="name"><dt>{{ label(name) }}</dt><dd class="fixture-value"><code>{{ value }}</code><button class="text-button" type="button" @click="copy(value, label(name))">Copy</button></dd></div></dl><details v-if="Object.keys(scenario.credentials).length" class="fixture-credentials"><summary>Seed-time local proof values</summary><p>Test values for these named local records only. Codes can expire or be used once; refreshing does not renew or issue them.</p><dl><div v-for="(value, name) in scenario.credentials" :key="name"><dt>{{ label(name) }}</dt><dd class="fixture-value"><code>{{ value }}</code><button class="text-button" type="button" @click="copy(value, label(name))">Copy</button></dd></div></dl></details><button class="secondary" type="button" @click="emit('navigate', scenario.category, { ...scenario.resourceIds })">Open {{ label(scenario.category) }}</button></article></div></details>
      </template>
    </template>
    <p v-if="copied" class="subtle" role="status">{{ copied }}</p>
  </section>
</template>
<style scoped>
.local-fixture-guide { margin-block: 1rem; }
.fixture-heading { display: flex; justify-content: space-between; align-items: start; flex-wrap: wrap; gap: .75rem; }
.fixture-heading h2, .fixture-heading h3 { margin-block: .35rem; }
.fixture-scenarios, .fixture-account-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 1rem; margin-top: 1rem; }
.fixture-scenario, .fixture-account-grid article { border: 1px solid var(--line, #dce5e0); border-radius: .85rem; padding: 1rem; min-width: 0; }
.fixture-value { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin: .3rem 0; }
.fixture-value code { overflow-wrap: anywhere; user-select: all; }
.fixture-filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 230px), 1fr)); gap: .75rem; margin-block: 1rem; }.fixture-filters label { display: grid; gap: .35rem; }.fixture-filters input, .fixture-filters select { width: 100%; }
.fixture-accounts, .fixture-browse, .fixture-credentials { margin-block: 1rem; }
dl { margin-block: .7rem; }dt { font-size: .8rem; color: var(--muted, #62746d); }dd { margin-inline-start: 0; }li { margin-bottom: .4rem; }p, small { overflow-wrap: anywhere; }
</style>
