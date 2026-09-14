<script setup lang="ts">
// The missing screen. Before, "project" was a form row below the theme picker
// in Settings, and there was no place in the app that answered
// "what are CF03B04's tasks?".
import { computed, nextTick, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, Archive, Inbox } from 'lucide-vue-next';
import ProjectChip from '../components/ProjectChip.vue';
import * as api from '../lib/db';
import { loadProjects, createProject, projects, tasks } from '../lib/store';
import { toast } from '../lib/toast';
import { fmtHM, fmtRelative } from '../lib/time';

const router = useRouter();
const creating = ref(false);
const name = ref('');
const nameInput = ref<HTMLInputElement | null>(null);
const showArchived = ref(false);
const archived = ref<api.ProjectSummary[]>([]);

/** The Inbox isn't a project, but it's where half the captures land. */
const inbox = computed(() => {
  const own = tasks.value.filter((t) => t.project_id === null);
  return {
    openCount: own.filter((t) => t.status !== 'done').length,
    minutes: own.reduce((s, t) => s + t.minutes, 0),
  };
});

async function startCreating(): Promise<void> {
  creating.value = true;
  await nextTick();
  nameInput.value?.focus();
}

async function submitNew(): Promise<void> {
  const p = await createProject(name.value);
  name.value = '';
  if (!p) return;
  creating.value = false;
  router.push(`/project/${p.id}`);
}

async function loadArchived(): Promise<void> {
  const all = await api.listProjectSummaries(true);
  archived.value = all.filter((p) => p.archived_at);
}

async function unarchive(p: api.ProjectSummary): Promise<void> {
  try {
    await api.updateProject(p.id, { archived_at: null });
    await Promise.all([loadProjects(), loadArchived()]);
    toast.ok(`${p.name} is back`);
  } catch (e) { toast.error(api.dbError(e)); }
}

onMounted(async () => { await loadProjects(); await loadArchived(); });
</script>

<template>
  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto max-w-[880px] px-6 pb-14 pt-7">
      <div class="flex items-baseline gap-3">
        <h1 class="display m-0 text-[32px] leading-none">Projects</h1>
        <span class="mono text-[12px] text-fg-subtle">{{ projects.length }}</span>
        <button class="btn btn-accent ml-auto" @click="startCreating">
          <Plus class="h-3.5 w-3.5" />New project
        </button>
      </div>

      <!-- inline creation: one field, one enter. The color comes on its own. -->
      <div v-if="creating" class="mt-4">
        <input ref="nameInput" v-model="name" class="inp" placeholder="Project name"
          spellcheck="false" @keydown.enter="submitNew" @keydown.esc="creating = false; name = ''">
        <p class="mt-1.5 font-mono text-[11px] text-fg-subtle">
          enter creates and opens · color is picked automatically · code and color can change later
        </p>
      </div>

      <div class="mt-5 grid grid-cols-[16px_minmax(0,1fr)_auto_auto] gap-3 px-3 pb-1">
        <span /><span />
        <span class="label w-20 text-right !text-[11px]">hours</span>
        <span class="label w-16 text-right !text-[11px]">open</span>
      </div>

      <div class="panel">
        <!-- Inbox first: it's where meeting captures land -->
        <button class="row w-full grid-cols-[16px_minmax(0,1fr)_auto_auto] text-left"
          @click="router.push('/project/inbox')">
          <Inbox class="h-3.5 w-3.5 text-fg-subtle" />
          <div class="min-w-0">
            <div class="truncate text-[14px] font-medium text-fg-muted">Inbox</div>
            <div class="mt-0.5 text-[11px] text-fg-subtle">captures without a project</div>
          </div>
          <span class="mono w-20 text-right text-[12px] text-fg-muted">{{ fmtHM(inbox.minutes) }}</span>
          <span class="mono w-16 text-right text-[12px]"
            :class="inbox.openCount ? 'text-fg' : 'text-fg-subtle'">{{ inbox.openCount || '—' }}</span>
        </button>

        <button v-for="p in projects" :key="p.id"
          class="row w-full grid-cols-[16px_minmax(0,1fr)_auto_auto] text-left"
          @click="router.push(`/project/${p.id}`)">
          <ProjectChip variant="dot" size="md" :color="p.color" />
          <div class="min-w-0">
            <div class="flex items-baseline gap-2">
              <span class="truncate text-[14px] font-medium">{{ p.name }}</span>
              <span v-if="p.code" class="mono flex-none text-[11px] text-fg-subtle">{{ p.code }}</span>
            </div>
            <div class="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-fg-subtle">
              <span v-if="p.doing_count" class="text-live-ink">{{ p.doing_count }} in progress</span>
              <span v-if="p.doing_count">·</span>
              <span>{{ p.done_count }} of {{ p.total_count }} done</span>
              <template v-if="p.last_activity_at"><span>·</span><span>{{ fmtRelative(p.last_activity_at) }}</span></template>
            </div>
          </div>
          <span class="mono w-20 text-right text-[12px] text-fg-muted">{{ fmtHM(p.minutes) }}</span>
          <span class="mono w-16 text-right text-[12px]"
            :class="p.open_count ? 'text-fg' : 'text-fg-subtle'">{{ p.open_count || '—' }}</span>
        </button>

        <p v-if="!projects.length" class="px-4 py-8 text-center text-[14px] text-fg-subtle">
          No projects yet.<br>
          <span class="text-[12px]">A project is just a name — the app fills in the rest.</span>
        </p>
      </div>

      <div v-if="archived.length" class="mt-7">
        <button class="label flex items-center gap-1.5 hover:text-fg-muted"
          @click="showArchived = !showArchived">
          <Archive class="h-3 w-3" />archived · {{ archived.length }}
        </button>
        <div v-if="showArchived" class="panel mt-2">
          <div v-for="p in archived" :key="p.id" class="row grid-cols-[16px_minmax(0,1fr)_auto]">
            <ProjectChip variant="dot" :color="p.color" />
            <span class="truncate text-[14px] text-fg-muted">{{ p.name }}</span>
            <button class="btn !py-1" @click="unarchive(p)">Restore</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
