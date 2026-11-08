<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'
import type { AdminControlRequest } from './adminControls'
import { readLocalFixtures, type FixtureScenario, type LocalFixtureManifest } from './localFixtures'
const props = defineProps<{ request: AdminControlRequest; actorId?: string }>()
const emit = defineEmits<{ navigate: [category: FixtureScenario['category'], resourceIds: Record<string, string>] }>()
const manifest = ref<LocalFixtureManifest | null>(null)
const busy = ref(false)
const error = ref('')
const copied = ref('')
let generation = 0
onUnmounted(() => { generation++ })
const label = (key: string) => key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase())
async function refresh() {
  if (busy.value) return
  const version = generation
  busy.value = true; error.value = ''; manifest.value = null
  try { const result = await readLocalFixtures(props.request); if (version === generation) manifest.value = result }
  catch (caught) { if (version === generation) error.value = caught instanceof Error ? caught.message : 'Local scenarios could not be read. Refresh to try again.' }
  finally { if (version === generation) busy.value = false }
}
async function copy(value: string, name: string) {
  try { await navigator.clipboard.writeText(value); copied.value = `${name} copied.` }
  catch { copied.value = 'Copy is unavailable in this browser. Select the displayed local value to copy it.' }
}
watch(() => props.actorId, () => { generation++; busy.value = false; manifest.value = null; copied.value = ''; void refresh() }, { immediate: true })
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
        <div class="fixture-scenarios"><article v-for="scenario in manifest.scenarios" :key="scenario.id" class="fixture-scenario"><div class="fixture-heading"><h3>{{ scenario.title }}</h3><span class="period-chip">{{ label(scenario.category) }}</span></div><p>{{ scenario.summary }}</p><ol v-if="scenario.nextActions.length"><li v-for="(action, index) in scenario.nextActions" :key="index">{{ action }}</li></ol><dl v-if="Object.keys(scenario.resourceIds).length"><div v-for="(value, name) in scenario.resourceIds" :key="name"><dt>{{ label(name) }}</dt><dd class="fixture-value"><code>{{ value }}</code><button class="text-button" type="button" @click="copy(value, label(name))">Copy</button></dd></div></dl><details v-if="Object.keys(scenario.credentials).length" class="fixture-credentials"><summary>Local test pickup / proof values</summary><p>These values apply only to the named local records.</p><dl><div v-for="(value, name) in scenario.credentials" :key="name"><dt>{{ label(name) }}</dt><dd class="fixture-value"><code>{{ value }}</code><button class="text-button" type="button" @click="copy(value, label(name))">Copy</button></dd></div></dl></details><button class="secondary" type="button" @click="emit('navigate', scenario.category, scenario.resourceIds)">Open {{ label(scenario.category) }}</button></article></div>
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
.fixture-accounts, .fixture-credentials { margin-block: 1rem; }
dl { margin-block: .7rem; }dt { font-size: .8rem; color: var(--muted, #62746d); }dd { margin-inline-start: 0; }li { margin-bottom: .4rem; }p, small { overflow-wrap: anywhere; }
</style>
