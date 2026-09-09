<script setup lang="ts">
import { computed } from 'vue';
import { Clock, Repeat, Play, Pause, Check } from 'lucide-vue-next';
import type { TaskCard } from '../lib/types';
import { fmtHM } from '../lib/tempo';
import { agora, decorrido, minutosDecorridos } from '../lib/relogio';
import { abreDetalhe } from '../lib/store';

const props = defineProps<{ card: TaskCard; rodandoDesde?: string | null }>();
const emit = defineEmits<{ iniciar: [id: number]; pausar: []; concluir: [id: number] }>();

const tempo = computed(() => props.rodandoDesde
  ? fmtHM(props.card.minutos + minutosDecorridos(props.rodandoDesde, agora.value))
  : fmtHM(props.card.minutos));
const relogio = computed(() => props.rodandoDesde ? decorrido(props.rodandoDesde, agora.value) : null);

const cor = computed(() => props.card.project_color ? `rgb(var(--${props.card.project_color}))` : null);

const dias = computed(() => {
  if (!props.card.due_at) return null;
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const d = new Date(props.card.due_at); d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - hoje.getTime()) / 86400000);
});
const prazo = computed(() => {
  const n = dias.value;
  if (n === null) return null;
  if (n < 0) return `${-n}d atrasado`;
  if (n === 0) return 'hoje';
  if (n === 1) return 'amanhã';
  if (n <= 6) return `${n}d`;
  return new Date(props.card.due_at!).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
});
</script>

<template>
  <div class="group relative cursor-grab rounded-xl border bg-surface p-3 transition-[transform,box-shadow,border-color]
              hover:-translate-y-px hover:shadow-pop active:cursor-grabbing"
    :class="rodandoDesde ? 'border-accent/60 shadow-live' : 'border-rule hover:border-rule-strong'">

    <!-- brilho de fundo do que está rodando -->
    <div v-if="rodandoDesde" class="pointer-events-none absolute inset-0 rounded-xl bg-accent/[0.06]" />

    <div class="relative flex items-start gap-2">
      <span v-if="cor" class="mt-[5px] h-2.5 w-2.5 flex-none rounded-full"
            :style="{ background: cor, boxShadow: `0 0 0 3px ${cor}22` }" />
      <span v-else class="mt-[5px] h-2.5 w-2.5 flex-none rounded-full bg-surface-3" />
      <div class="min-w-0 flex-1">
        <button class="line-clamp-2 text-left text-[13px] font-semibold leading-[1.35] tracking-[-0.01em] hover:text-accent-ink"
                @click.stop="abreDetalhe(card.id)">{{ card.title }}</button>
        <div v-if="card.origem_title" class="mt-0.5 truncate text-[10.5px] text-fg-subtle">
          de {{ card.origem_title }}
        </div>
      </div>

      <!-- ações: aparecem no hover; a de rodando é permanente -->
      <div class="flex flex-none items-center gap-0.5 -mr-1 -mt-1"
           :class="rodandoDesde ? '' : 'opacity-0 transition-opacity group-hover:opacity-100'">
        <button v-if="rodandoDesde" class="btn btn-ghost !p-1.5 !text-vivo-ink" title="Pausar"
                @click.stop="emit('pausar')"><Pause class="h-3.5 w-3.5" /></button>
        <button v-else class="btn btn-ghost !p-1.5" title="Começar agora"
                @click.stop="emit('iniciar', card.id)"><Play class="h-3.5 w-3.5" /></button>
        <button v-if="card.status !== 'feito'" class="btn btn-ghost !p-1.5" title="Concluir"
                @click.stop="emit('concluir', card.id)"><Check class="h-3.5 w-3.5" /></button>
      </div>
    </div>

    <div class="relative mt-2.5 flex items-center gap-2 font-mono text-[10px] text-fg-subtle">
      <span v-if="card.project_code" class="chip"
        :style="cor ? { background: `${cor}1f`, color: cor } : undefined"
        :class="!cor && 'bg-surface-3 text-fg-muted'">{{ card.project_code }}</span>
      <span v-if="card.kind === 'reuniao'" class="chip bg-reuniao/15 text-reuniao">reunião</span>
      <span v-else-if="card.kind === 'admin'" class="chip bg-surface-3 text-fg-muted">admin</span>
      <span v-if="prazo" class="flex items-center gap-1 font-medium"
        :class="dias !== null && dias <= 1 ? 'text-danger' : 'text-warn'">
        <Clock class="h-3 w-3" />{{ prazo }}
      </span>
      <span v-if="card.sessoes > 2" class="flex items-center gap-0.5" :title="`${card.sessoes} sessões`">
        <Repeat class="h-3 w-3" />{{ card.sessoes }}
      </span>
      <span class="ml-auto text-[12.5px] font-semibold leading-none"
        :class="rodandoDesde ? 'text-vivo-ink' : 'text-fg-muted'">{{ relogio ?? tempo }}</span>
    </div>
  </div>
</template>
