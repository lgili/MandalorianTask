<script setup lang="ts">
// The project picker's panel. It has no input of its own: the parent does the
// typing (the capture line, or the popover's search field). That way the SAME
// panel serves the capture's `#` token and the task detail's picker.
//
// The rule that makes this work: the "create" row is never preselected
// when there are results. A quick Enter must not fabricate a project.
import { computed, ref, watch } from 'vue';
import { Plus, Inbox } from 'lucide-vue-next';
import ProjectChip from './ProjectChip.vue';
import type { Project } from '../lib/types';
import { canCreateProject, rankProjects } from '../lib/projects';
import { projects } from '../lib/store';

const props = withDefaults(defineProps<{
  query: string;
  allowCreate?: boolean;
  /** Shows "Inbox" (no project) as the first option — for reassigning. */
  includeInbox?: boolean;
}>(), { allowCreate: true, includeInbox: false });

const emit = defineEmits<{ pick: [Project | null]; create: [string] }>();

type Item =
  | { kind: 'inbox' }
  | { kind: 'project'; p: Project & { open_count?: number } }
  | { kind: 'create'; name: string };

const ranked = computed(() => rankProjects(props.query, projects.value));

const items = computed<Item[]>(() => {
  const out: Item[] = [];
  if (props.includeInbox && !props.query.trim()) out.push({ kind: 'inbox' });
  for (const p of ranked.value) out.push({ kind: 'project', p });
  if (props.allowCreate && canCreateProject(props.query, projects.value)) {
    out.push({ kind: 'create', name: props.query.trim() });
  }
  return out;
});

const activeIndex = ref(0);

/**
 * Where the cursor lands on each new query: on the first RESULT.
 * It only falls on the create row when there are no results at all — otherwise
 * typing fast and hitting Enter would create a duplicate project by accident.
 */
watch(items, (list) => {
  const first = list.findIndex((i) => i.kind !== 'create');
  activeIndex.value = first >= 0 ? first : 0;
}, { immediate: true });

function move(delta: number): void {
  const n = items.value.length;
  if (!n) return;
  activeIndex.value = (activeIndex.value + delta + n) % n;
}

function pick(i: number): void {
  const item = items.value[i];
  if (!item) return;
  if (item.kind === 'create') emit('create', item.name);
  else if (item.kind === 'inbox') emit('pick', null);
  else emit('pick', item.p);
}

const accept = (): void => pick(activeIndex.value);
const isEmpty = computed(() => items.value.length === 0);

defineExpose({ move, accept, isEmpty });
</script>

<template>
  <div class="panel overflow-hidden shadow-pop">
    <div class="max-h-[264px] overflow-y-auto py-1">
      <p v-if="isEmpty" class="px-3 py-2.5 text-[12px] text-fg-subtle">
        No project by that name.
      </p>

      <template v-for="(it, i) in items" :key="it.kind === 'project' ? it.p.id : it.kind">
        <div v-if="it.kind === 'create'" class="my-1 border-t border-rule" />

        <button type="button"
          class="flex h-8 w-full items-center gap-2.5 px-3 text-left transition-colors"
          :class="i === activeIndex ? 'bg-surface-3' : 'hover:bg-surface-3/50'"
          @mouseenter="activeIndex = i" @click="pick(i)">

          <template v-if="it.kind === 'project'">
            <ProjectChip variant="dot" :color="it.p.color" />
            <span class="mono w-16 flex-none truncate text-[11px] text-fg-subtle">{{ it.p.code }}</span>
            <span class="min-w-0 flex-1 truncate text-[14px]">{{ it.p.name }}</span>
            <span v-if="it.p.open_count" class="mono flex-none text-[11px] text-fg-subtle">{{ it.p.open_count }}</span>
          </template>

          <template v-else-if="it.kind === 'inbox'">
            <Inbox class="h-3.5 w-3.5 flex-none text-fg-subtle" />
            <span class="min-w-0 flex-1 truncate text-[14px] text-fg-muted">Inbox — no project</span>
          </template>

          <template v-else>
            <Plus class="h-3.5 w-3.5 flex-none text-accent-ink" />
            <span class="min-w-0 flex-1 truncate text-[14px]">
              Create project <span class="font-medium text-accent-ink">{{ it.name }}</span>
            </span>
          </template>
        </button>
      </template>
    </div>

    <div class="flex items-center gap-3 border-t border-rule bg-surface-2/60 px-3 py-1
                font-mono text-[11px] text-fg-subtle">
      <span>↑↓ navigate</span><span>⏎ pick</span><span>esc plain text</span>
    </div>
  </div>
</template>
