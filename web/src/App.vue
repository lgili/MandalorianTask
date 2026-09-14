<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { RouterView, useRoute, useRouter } from 'vue-router';
import { useEventListener } from '@vueuse/core';
import { Square, AlertTriangle, Plus, Settings, Puzzle } from 'lucide-vue-next';
import ToastHost from './components/ToastHost.vue';
import TaskDetail from './components/TaskDetail.vue';
import QuickAdd from './components/QuickAdd.vue';
import Palette from './components/Palette.vue';
import ProjectChip from './components/ProjectChip.vue';
import {
  openTaskDetail, openQuickAdd, draggingTaskId, loadProjects, loadBoard, loadDay,
  createProject, palette, projects, quickAdd, running, pause, dropOnProject, tasks, daySessions,
} from './lib/store';
import { predictNextColor } from './lib/projects';
import { openVault, createNote, pickVault, notes, syncVault, vaultPath } from './lib/notes';
import { registerCommand } from './lib/commands';
import { initPlugins } from './lib/plugins';
import { panels } from './lib/plugins/api';
import { cycleTheme } from './lib/theme';
import * as api from './lib/db';
import { toast } from './lib/toast';
import { now, fmtElapsed } from './lib/clock';
import { isEscapeHatch, canUseBareShortcut } from './lib/keyboard';
import { addDays, dayKey } from './lib/time';

const route = useRoute();
const router = useRouter();
const appVersion = __APP_VERSION__;
const navs = router.getRoutes().filter((r) => r.meta?.shortcut)
  .sort((a, b) => a.meta.shortcut.localeCompare(b.meta.shortcut));

const navCounts = computed<Record<string, number | string>>(() => ({
  '/projects': projects.value.length,
  '/notes': notes.value.length,
  '/capture': tasks.value.filter((t) => t.status === 'backlog').length,
  '/board': tasks.value.filter((t) => t.status === 'queued' || t.status === 'doing').length,
  '/today': daySessions.value.length,
}));

/** The six most active projects. `listProjectSummaries` already sorts by activity. */
const visibleProjects = computed(() => projects.value.slice(0, 6));

// ── create a project WITHOUT leaving where you are ────────────────────────
// The `+` here used to just navigate to /projects, where a second click was
// still needed for the field to show up: two navigations and two clicks for the
// operation the owner does most. Now the row is born in edit mode right here.
const creatingProject = ref(false);
const newProjectName = ref('');
const projectInput = ref<HTMLInputElement | null>(null);
/** Lights the dot with the color the project WILL get, before confirming. */
const nextColor = computed(() => predictNextColor(projects.value));

async function startProjectCreation(): Promise<void> {
  creatingProject.value = true;
  await nextTick();
  projectInput.value?.focus();
}

async function confirmProject(): Promise<void> {
  const p = await createProject(newProjectName.value);
  newProjectName.value = '';
  if (!p) return;
  creatingProject.value = false;
  router.push(`/project/${p.id}`);
}

/** Project under the dragged card. */
const dropTargetProject = ref<number | null>(null);

/** The current screen's project, so quick-add starts already linked to it. */
const screenProjectId = computed(() => {
  if (route.name !== 'project') return null;
  const id = Number(route.params.id);
  return Number.isFinite(id) ? id : null;
});

/** Title of the top bar: the project's (or panel's) name when you are inside one. */
const screenTitle = computed(() => {
  if (route.name === 'plugin') {
    return panels.value.find((p) => p.plugin === route.params.plugin && p.id === route.params.panel)?.title ?? 'Plugin';
  }
  if (route.name !== 'project') return route.meta.title;
  if (route.params.id === 'inbox') return 'Inbox';
  return projects.value.find((p) => p.id === Number(route.params.id))?.name ?? 'Project';
});

// ── the app's own commands ────────────────────────────────────────────────
// Registered the way any plugin would register them: the palette can't tell them apart.
async function newNote(): Promise<void> {
  if (!vaultPath.value) { router.push('/notes'); return; }
  const p = await createNote('Untitled');
  router.push({ name: 'notes', query: { note: p } });
}
const APP_COMMANDS = [
  { id: 'new-task', name: 'New task', shortcut: 'n', run: () => openQuickAdd(screenProjectId.value) },
  { id: 'new-note', name: 'New note', shortcut: 'ctrl+alt+n', run: newNote },
  { id: 'new-project', name: 'New project', run: () => router.push('/projects') },
  { id: 'search', name: 'Search everything', shortcut: 'ctrl+k', run: () => { palette.value = 'search'; } },
  { id: 'pause', name: 'Pause the running task', run: () => pause() },
  { id: 'cycle-theme', name: 'Switch theme', run: () => { cycleTheme(); } },
  { id: 'open-vault', name: 'Open another folder as vault', run: async () => { await pickVault(); } },
  { id: 'reindex', name: 'Reindex the vault', run: async () => {
    const r = await syncVault(); toast.ok(`${r.reread} notes re-read`);
  } },
  ...navs.map((r) => ({ id: `go:${r.path}`, name: `Go to ${r.meta.title}`, shortcut: r.meta.shortcut,
    run: () => router.push(r.path) })),
];
for (const c of APP_COMMANDS) registerCommand({ ...c, owner: 'bancada' });

useEventListener(window, 'keydown', (e: KeyboardEvent) => {
  // Ctrl+K / Ctrl+O search, Ctrl+P commands — from ANYWHERE, including inside
  // the editor: it's how you get out of a note without touching the mouse.
  const mod = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
  if (mod && (e.key === 'k' || e.key === 'o')) { e.preventDefault(); palette.value = 'search'; return; }
  if (mod && e.key === 'p') { e.preventDefault(); palette.value = 'commands'; return; }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === 'n') { e.preventDefault(); void newNote(); return; }

  // `n` opens capture from any screen — including inside a project, and then
  // it comes already linked to it.
  if (canUseBareShortcut(e) && e.key === 'n') {
    e.preventDefault();
    openQuickAdd(screenProjectId.value);
    return;
  }
  for (const r of navs) {
    if (isEscapeHatch(e, r.meta.shortcut) || (canUseBareShortcut(e) && e.key === r.meta.shortcut)) {
      e.preventDefault(); router.push(r.path); return;
    }
  }
});

const clock = computed(() => running.value ? fmtElapsed(running.value.started_at, now.value) : null);
const forgottenSession = computed(() => running.value
  ? (now.value.getTime() - new Date(running.value.started_at).getTime()) / 3600000 > 8 : false);

/** THIS WEEK: completed + sparkline of the last 7 days. */
const week = ref<number[]>([0, 0, 0, 0, 0, 0, 0]);
const completedThisWeek = computed(() => week.value.reduce((a, b) => a + b, 0));
async function loadWeek(): Promise<void> {
  const rows = await api.countCompletedByDay(7);
  const today = dayKey();
  week.value = Array.from({ length: 7 }, (_, i) => rows.find((r) => r.day === addDays(today, i - 6))?.n ?? 0);
}

onMounted(async () => {
  try {
    // Projects created before colors existed were born grey. Silent fix.
    await api.backfillProjectColors();
    await loadProjects();
    await Promise.all([loadBoard(), loadDay(), loadWeek()]);
    await api.archiveDoneTasks(14);   // cleanup is silent: nobody asked for that notice
    // The vault opens AFTER the board: indexing a large vault must not
    // delay the screen you use first thing in the morning.
    // Plugins start AFTER the vault: community ones live inside it, and
    // trust is per vault. Core ones start even with no vault open.
    void openVault()
      .catch((e) => toast.warning(`Vault unavailable: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => initPlugins());
    const id = Number(new URLSearchParams(location.search).get('task'));
    if (id) openTaskDetail(id);
  } catch (e) {
    toast.error(`Database unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }
});
</script>

<template>
  <div class="grid h-screen grid-cols-[236px_minmax(0,1fr)] max-[900px]:grid-cols-[56px_minmax(0,1fr)]">
    <aside class="flex min-w-0 flex-col border-r border-rule bg-surface-2">
      <div class="flex items-center gap-2.5 px-5 pb-3 pt-5">
        <div class="h-5 w-5 flex-none rounded-md bg-accent shadow-[0_0_16px_-2px_rgb(var(--glow)/.7)]" />
        <div class="display text-[20px] leading-none max-[900px]:hidden">Bancada</div>
      </div>

      <div class="min-h-0 flex-1 overflow-y-auto">
        <nav class="flex flex-col gap-px px-3 pt-2">
          <RouterLink v-for="r in navs" :key="r.path" :to="r.path"
            class="grid grid-cols-[8px_1fr_auto] items-center gap-3 rounded-lg px-3 py-[7px] text-[14px] transition-colors
                   max-[900px]:grid-cols-[8px] max-[900px]:justify-center"
            :class="route.path === r.path ? 'bg-surface-3/70 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg'">
            <span class="h-1.5 w-1.5 rounded-full" :class="route.path === r.path ? 'bg-accent' : 'bg-rule-strong'" />
            <span class="max-[900px]:hidden">{{ r.meta.title }}</span>
            <span class="mono text-[11px] text-fg-subtle max-[900px]:hidden">{{ navCounts[r.path] || '' }}</span>
          </RouterLink>
        </nav>

        <!-- ── projects: separated from navigation by a section label, otherwise
             "Reports" and "Flyback rev C" look like the same thing ── -->
        <div class="mt-5 px-3 max-[900px]:hidden">
          <div class="flex items-center gap-2 px-3 pb-1">
            <span class="label">Projects</span>
            <button class="ml-auto rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface-3 hover:text-fg"
              title="New project" @click="startProjectCreation">
              <Plus class="h-3 w-3" />
            </button>
          </div>

          <!-- new row in edit mode, with its color already lit -->
          <div v-if="creatingProject"
            class="grid grid-cols-[10px_1fr] items-center gap-2.5 rounded-lg px-3 py-1">
            <ProjectChip variant="dot" :color="nextColor" />
            <input ref="projectInput" v-model="newProjectName" spellcheck="false"
              class="w-full bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-subtle"
              placeholder="project name"
              @keydown.enter="confirmProject"
              @keydown.esc="creatingProject = false; newProjectName = ''"
              @blur="creatingProject = false; newProjectName = ''">
          </div>

          <!-- dropping a board card here reassigns its project -->
          <RouterLink v-for="p in visibleProjects" :key="p.id" :to="`/project/${p.id}`"
            class="grid grid-cols-[10px_1fr_auto] items-center gap-2.5 rounded-lg px-3 py-1 text-[12px] transition-colors"
            :class="[
              route.path === `/project/${p.id}` ? 'bg-surface-3/70 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg',
              dropTargetProject === p.id && draggingTaskId ? 'ring-2 ring-inset ring-accent/60 bg-accent/10' : '',
            ]"
            @dragover.prevent="dropTargetProject = p.id" @dragleave="dropTargetProject = null"
            @drop.prevent="dropTargetProject = null; dropOnProject(p.id)">
            <ProjectChip variant="dot" :color="p.color" />
            <span class="truncate">{{ p.name }}</span>
            <span v-if="p.open_count" class="mono text-[11px] text-fg-subtle">{{ p.open_count }}</span>
          </RouterLink>

          <RouterLink v-if="projects.length > 6" to="/projects"
            class="block px-3 py-1 font-mono text-[11px] text-fg-subtle hover:text-fg">
            ⋯ see all ({{ projects.length }})
          </RouterLink>
          <RouterLink v-if="!projects.length" to="/projects"
            class="block px-3 py-1 text-[12px] text-fg-subtle hover:text-fg">
            create the first one →
          </RouterLink>
        </div>

        <!-- ── plugin panels: only shows up if some plugin registered one ── -->
        <div v-if="panels.length" class="mt-5 px-3 max-[900px]:hidden">
          <div class="px-3 pb-1"><span class="label">Plugins</span></div>
          <RouterLink v-for="p in panels" :key="`${p.plugin}/${p.id}`"
            :to="{ name: 'plugin', params: { plugin: p.plugin, panel: p.id } }"
            class="grid grid-cols-[12px_1fr] items-center gap-2.5 rounded-lg px-3 py-1 text-[12px] transition-colors"
            :class="route.name === 'plugin' && route.params.plugin === p.plugin && route.params.panel === p.id
              ? 'bg-surface-3/70 text-fg' : 'text-fg-muted hover:bg-surface-3/40 hover:text-fg'"
            :title="p.pluginName">
            <Puzzle class="h-3 w-3" />
            <span class="truncate">{{ p.title }}</span>
          </RouterLink>
        </div>
      </div>

      <div class="mx-4 border-t border-rule pb-2 pt-4 max-[900px]:hidden">
        <template v-if="running">
          <div class="label mb-1 flex items-center gap-1.5 !text-accent-ink">
            <span class="relative flex h-1.5 w-1.5"><span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" /><span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" /></span>
            running
          </div>
          <div class="mb-1 line-clamp-2 text-[12px] leading-snug text-fg">{{ running.title }}</div>
          <div class="flex items-center gap-2">
            <span class="mono text-[24px] leading-none text-accent-ink font-semibold tracking-[-0.02em]">{{ clock }}</span>
            <button class="btn btn-ghost btn-icon ml-auto" title="Pause" @click="pause"><Square class="h-3.5 w-3.5" /></button>
          </div>
        </template>
        <template v-else>
          <div class="label mb-1">last 7 days</div>
          <div class="flex items-baseline gap-2">
            <span class="text-[32px] leading-none font-semibold tracking-[-0.02em]">{{ completedThisWeek }}</span>
            <span class="text-[12px] text-fg-muted">{{ completedThisWeek === 1 ? 'task completed' : 'tasks completed' }}</span>
          </div>
        </template>
        <div class="mt-3 flex h-6 items-end gap-1">
          <div v-for="(n, i) in week" :key="i" class="flex-1 rounded-[2px]"
            :class="i === 6 ? 'bg-accent' : 'bg-surface-3'"
            :style="{ height: Math.max(3, (n / Math.max(1, ...week)) * 24) + 'px' }" />
        </div>
      </div>

      <div class="flex items-center gap-1.5 px-5 pb-3 font-mono text-[11px] text-fg-subtle max-[900px]:hidden">
        <RouterLink to="/settings" class="flex items-center gap-1 hover:text-fg">
          <Settings class="h-3 w-3" />settings
        </RouterLink>
        <span class="ml-auto opacity-70">v{{ appVersion }}</span>
      </div>
    </aside>

    <main class="flex min-w-0 flex-col overflow-hidden">
      <div class="flex h-14 flex-none items-center gap-3 border-b border-rule px-6">
        <span class="truncate text-[16px] font-semibold tracking-[-0.01em]">{{ screenTitle }}</span>
        <div v-if="running && route.path !== '/'" class="ml-auto flex items-center gap-2 text-[12px] text-fg-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-accent" />
          <span class="max-w-[260px] truncate">{{ running.title }}</span>
          <span class="mono font-medium text-accent-ink">{{ clock }}</span>
        </div>
        <!-- This button used to just navigate to the capture screen. Now it creates. -->
        <button class="btn btn-accent" :class="!(running && route.path !== '/') && 'ml-auto'"
          @click="openQuickAdd(screenProjectId)">
          <Plus class="h-3.5 w-3.5" />New task
          <span class="mono ml-1 rounded bg-black/15 px-1 text-[11px] opacity-70">n</span>
        </button>
      </div>

      <div v-if="forgottenSession" class="flex flex-none items-center gap-2.5 border-b border-warn/40 bg-warn/10 px-6 py-1.5 text-[12px]">
        <AlertTriangle class="h-3.5 w-3.5 flex-none text-warn" />
        <span>This session is over 8 h — it was probably left open overnight.</span>
        <button class="btn ml-auto" @click="pause">Stop now</button>
      </div>

      <RouterView />
    </main>

    <QuickAdd v-if="quickAdd" />
    <Palette v-if="palette" :key="palette" />
    <TaskDetail />
    <ToastHost />
  </div>
</template>
