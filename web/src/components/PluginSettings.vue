<script setup lang="ts">
// Settings > Plugins. Core plugins turn on and off freely; community plugins
// require leaving restricted mode FIRST, with the warning right in front of you —
// a plugin runs with full access to the app, just like in Obsidian, and the
// person needs to know that when enabling one.
import { computed, ref } from 'vue';
import { AlertTriangle, RefreshCw, Download } from 'lucide-vue-next';
import { setPluginEnabled, setRestricted, installExamplePlugin, plugins, reloadCommunityPlugins, restricted } from '../lib/plugins';
import { vaultPath } from '../lib/notes';
import { toast } from '../lib/toast';

const core = computed(() => plugins.value.filter((p) => p.origin === 'core'));
const community = computed(() => plugins.value.filter((p) => p.origin === 'community'));
const confirming = ref(false);
const busy = ref(false);

async function toggle(id: string, enable: boolean): Promise<void> {
  busy.value = true;
  try {
    await setPluginEnabled(id, enable);
    const p = plugins.value.find((x) => x.manifest.id === id);
    if (enable && p?.error) toast.error(`${p.manifest.name}: ${p.error}`);
  } finally { busy.value = false; }
}

async function leaveRestrictedMode(): Promise<void> {
  confirming.value = false;
  await setRestricted(false);
}

async function installExample(): Promise<void> {
  const id = await installExamplePlugin();
  toast.ok(`Example plugin installed in .bancada/plugins/${id} — enable it below`);
}

async function rescan(): Promise<void> {
  await reloadCommunityPlugins();
  toast.ok(`${community.value.length} ${community.value.length === 1 ? 'plugin found' : 'plugins found'}`);
}
</script>

<template>
  <div class="panel">
    <div class="border-b border-rule px-6 py-2.5"><span class="label">Plugins</span></div>

    <!-- core -->
    <div class="px-6 pb-2 pt-3">
      <div class="mb-1 text-[12px] font-medium text-fg-muted">Built in</div>
      <div v-for="p in core" :key="p.manifest.id" class="flex items-start gap-3 border-b border-rule py-2.5 last:border-b-0">
        <div class="min-w-0 flex-1">
          <div class="text-[14px] text-fg">{{ p.manifest.name }}</div>
          <div class="text-[12px] text-fg-subtle">{{ p.manifest.description }}</div>
          <div v-if="p.error" class="mt-1 text-[12px] text-danger">{{ p.error }}</div>
        </div>
        <button role="switch" :aria-checked="p.enabled" :disabled="busy"
          class="relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors"
          :class="p.enabled ? 'bg-accent' : 'bg-surface-3'"
          :title="p.enabled ? 'Disable' : 'Enable'"
          @click="toggle(p.manifest.id, !p.enabled)">
          <span class="absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-card transition-all"
            :class="p.enabled ? 'left-[18px]' : 'left-0.5'" />
        </button>
      </div>
    </div>

    <!-- community -->
    <div class="border-t border-rule px-6 pb-4 pt-3">
      <div class="mb-1 text-[12px] font-medium text-fg-muted">Community</div>

      <p v-if="!vaultPath" class="py-2 text-[12px] text-fg-subtle">
        Community plugins live inside the vault. Open a vault in Notes first.
      </p>

      <template v-else-if="restricted">
        <p class="py-2 text-[12px] leading-relaxed text-fg-subtle">
          <b class="text-fg">Restricted mode on</b> in this vault: plugins in the
          <code class="mono">.bancada/plugins/</code> folder are not loaded.
          <template v-if="community.length"> {{ community.length }} installed.</template>
        </p>
        <div v-if="confirming" class="panel mt-1 !border-warn/50 bg-warn/5 p-3">
          <div class="flex gap-2 text-[12px] leading-relaxed">
            <AlertTriangle class="mt-0.5 h-4 w-4 flex-none text-warn" />
            <span>
              Plugins run with <b>full access</b> to the app: they read and write your notes, tasks and the database.
              Only enable plugins you trust. The decision applies to <b>this vault</b> and is saved in the
              app — a vault copied from someone else always opens in restricted mode.
            </span>
          </div>
          <div class="mt-3 flex gap-2">
            <button class="btn btn-accent" @click="leaveRestrictedMode">Got it, trust this vault</button>
            <button class="btn" @click="confirming = false">Cancel</button>
          </div>
        </div>
        <button v-else class="btn mt-1" @click="confirming = true">Turn off restricted mode</button>
      </template>

      <template v-else>
        <div v-for="p in community" :key="p.manifest.id" class="flex items-start gap-3 border-b border-rule py-2.5 last:border-b-0">
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="text-[14px] text-fg">{{ p.manifest.name }}</span>
              <span class="mono text-[11px] text-fg-subtle">{{ p.manifest.version }}</span>
              <span v-if="p.manifest.author" class="text-[11px] text-fg-subtle">· {{ p.manifest.author }}</span>
            </div>
            <div v-if="p.manifest.description" class="text-[12px] text-fg-subtle">{{ p.manifest.description }}</div>
            <div v-if="p.error" class="mt-1 text-[12px] text-danger">{{ p.error }}</div>
          </div>
          <button role="switch" :aria-checked="p.enabled" :disabled="busy || p.manifest.version === '?'"
            class="relative mt-0.5 h-5 w-9 flex-none rounded-full transition-colors disabled:opacity-40"
            :class="p.enabled ? 'bg-accent' : 'bg-surface-3'"
            @click="toggle(p.manifest.id, !p.enabled)">
            <span class="absolute top-0.5 h-4 w-4 rounded-full bg-surface shadow-card transition-all"
              :class="p.enabled ? 'left-[18px]' : 'left-0.5'" />
          </button>
        </div>
        <p v-if="!community.length" class="py-2 text-[12px] text-fg-subtle">
          No plugins in <code class="mono">.bancada/plugins/</code>. Copy a plugin folder there,
          or install the example one.
        </p>
        <div class="mt-3 flex flex-wrap gap-2">
          <button class="btn" @click="rescan"><RefreshCw class="h-3.5 w-3.5" />Scan again</button>
          <button class="btn" @click="installExample"><Download class="h-3.5 w-3.5" />Install the example plugin</button>
          <button class="btn btn-ghost ml-auto" @click="setRestricted(true)">Back to restricted mode</button>
        </div>
      </template>
    </div>
  </div>
</template>
