<script setup lang="ts">
// Settings is back to being settings. Project CRUD used to live here, below the
// theme picker — creating a project meant leaving what you were doing,
// navigating to the last screen and losing what you had typed. Now it
// lives in /projects, which is where your hand already is.
import { useRouter } from 'vue-router';
import { ref } from 'vue';
import { ArrowRight, FolderOpen, RefreshCw } from 'lucide-vue-next';
import { projects } from '../lib/store';
import { pickVault, notes, syncVault, syncing, vaultPath } from '../lib/notes';
import { toast } from '../lib/toast';
import PluginSettings from '../components/PluginSettings.vue';
import { GRAIN_MIN, currentTz } from '../lib/time';
import { THEMES, applyTheme, currentTheme } from '../lib/theme';

const router = useRouter();
const theme = ref(currentTheme());
function pickTheme(t: typeof theme.value): void { theme.value = t; applyTheme(t); }

async function changeVault(): Promise<void> {
  if (await pickVault()) toast.ok(`Vault opened: ${notes.value.length} notes`);
}
async function reindex(): Promise<void> {
  const r = await syncVault();
  toast.ok(r.reread || r.removed ? `${r.reread} re-read, ${r.removed} removed from the index` : 'Index was already up to date');
}
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="flex max-w-[620px] flex-col gap-4 px-6 pb-10 pt-3">
      <div class="panel">
        <div class="border-b border-rule px-6 py-2.5"><span class="label">Appearance</span></div>
        <div class="grid grid-cols-3 gap-2 p-3">
          <button v-for="t in THEMES" :key="t.id" @click="pickTheme(t.id)"
            class="rounded-xl border p-3 text-left transition"
            :class="theme === t.id ? 'border-accent bg-accent/10 shadow-glow' : 'border-rule hover:border-rule-strong'">
            <div class="text-[14px] font-semibold">{{ t.name }}</div>
            <div class="text-[11px] text-fg-subtle">{{ t.desc }}</div>
          </button>
        </div>
      </div>

      <button class="panel flex items-center gap-3 px-6 py-3 text-left transition hover:border-rule-strong"
        @click="router.push('/projects')">
        <div>
          <div class="text-[14px] font-semibold">Projects</div>
          <div class="text-[12px] text-fg-subtle">
            {{ projects.length }} {{ projects.length === 1 ? 'project' : 'projects' }} ·
            create, rename, color, code and archive live on the Projects screen
          </div>
        </div>
        <ArrowRight class="ml-auto h-4 w-4 flex-none text-fg-subtle" />
      </button>

      <div class="panel">
        <div class="border-b border-rule px-6 py-2.5"><span class="label">Notes vault</span></div>
        <div class="space-y-3 px-6 py-3.5 text-[12px] text-fg-muted">
          <p v-if="vaultPath">
            <code class="mono break-all rounded bg-surface-2 px-1 py-0.5 text-[11px] text-fg">{{ vaultPath }}</code>
            <span class="ml-1">· {{ notes.length }} notes</span>
          </p>
          <p v-else>No folder open.</p>
          <p class="leading-relaxed">
            The <code class="mono">.md</code> files are the source of truth; the app keeps only a search
            index, which can be thrown away and rebuilt. It can be the same folder Obsidian uses.
          </p>
          <div class="flex gap-2">
            <button class="btn" @click="changeVault"><FolderOpen class="h-3.5 w-3.5" />{{ vaultPath ? 'Change folder' : 'Open folder' }}</button>
            <button v-if="vaultPath" class="btn" :disabled="syncing" @click="reindex">
              <RefreshCw class="h-3.5 w-3.5" :class="syncing && 'animate-spin'" />Reindex
            </button>
          </div>
        </div>
      </div>

      <PluginSettings />

      <div class="panel">
        <div class="border-b border-rule px-6 py-2.5"><span class="label">How time is measured</span></div>
        <div class="space-y-2.5 px-6 py-3.5 text-[12px] leading-relaxed text-fg-muted">
          <p>
            Moving a card to <b class="text-fg">Doing</b> opens a session; moving it out closes it.
            There is no timer button — time is a consequence of the board.
          </p>
          <p>
            <b class="text-fg">Only one session runs at a time</b>, enforced by the database. Starting a
            task stops the previous one, so the same hour can never be counted twice.
          </p>
          <p>
            Measured time keeps the whole minute. The {{ GRAIN_MIN }} min step only exists when you
            <b class="text-fg">fix a time by hand</b> in Today — measurements aren't rounded,
            estimates are.
          </p>
        </div>
      </div>

      <div class="panel">
        <div class="border-b border-rule px-6 py-2.5"><span class="label">Shortcuts</span></div>
        <div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-6 py-3.5 text-[12px] text-fg-muted">
          <span class="mono text-fg">n</span><span>new task, from any screen</span>
          <span class="mono text-fg">ctrl+k</span><span>search notes, projects and tasks</span>
          <span class="mono text-fg">ctrl+p</span><span>commands — from the app and plugins</span>
          <span class="mono text-fg">ctrl+alt+n</span><span>new note</span>
          <span class="mono text-fg">1…7</span><span>navigate</span>
          <span class="mono text-fg">alt+1…7</span><span>navigate even with the cursor in a field</span>
          <span class="mono text-fg">[[</span><span>link to another note, in the editor</span>
          <span class="mono text-fg">#</span><span>project, in the capture line</span>
          <span class="mono text-fg">!</span><span>due: <span class="mono">today · thu · 12/09 · +3d</span></span>
          <span class="mono text-fg">@</span><span>type: <span class="mono">meeting · admin</span></span>
          <span class="mono text-fg">esc</span><span>closes whatever is open</span>
        </div>
      </div>

      <div class="panel">
        <div class="border-b border-rule px-6 py-2.5"><span class="label">Data</span></div>
        <div class="px-6 py-3.5 text-[12px] leading-relaxed text-fg-muted">
          A SQLite file in
          <code class="mono rounded bg-surface-2 px-1 py-0.5 text-[11px]">%APPDATA%\com.lgili.bancada\</code>.
          Backup is copying the file. Time zone: <span class="mono">{{ currentTz() }}</span>.
        </div>
      </div>
    </div>
  </div>
</template>
