<script setup lang="ts">
import { ref, watch } from 'vue';
import { Trash2 } from 'lucide-vue-next';
import { onKeyStroke } from '@vueuse/core';
import type { SessionCard } from '../lib/types';
import { modaisAbertos } from '../lib/teclado';
import { minutosDoDia, utcDe, fmtDur, GRAO_MIN } from '../lib/tempo';

const props = defineProps<{ sessao: SessionCard | null; dia: string }>();
const emit = defineEmits<{
  salvar: [id: number, patch: { started_at: string; ended_at: string }];
  excluir: [id: number];
  fechar: [];
}>();

const de = ref(540);
const ate = ref(600);

watch(() => props.sessao, (s) => {
  modaisAbertos.value = s ? 1 : 0;
  if (!s) return;
  de.value = minutosDoDia(s.started_at);
  ate.value = s.ended_at ? minutosDoDia(s.ended_at) : de.value + 60;
}, { immediate: true });

onKeyStroke('Escape', () => { if (props.sessao) emit('fechar'); });

const hm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/**
 * Tempo MEDIDO não se arredonda; tempo ajustado à mão, sim. Por isso o input
 * usa passo de 15 min, mas a sessão automática guarda o minuto cheio que ela
 * mediu — corrigir um horário não deve reescrever o que foi observado.
 */
function ajusta(alvo: EventTarget | null, set: (m: number) => void, ler: () => number): void {
  const el = alvo as HTMLInputElement | null;
  if (!el) return;
  const [h, m] = el.value.split(':').map(Number);
  set(Math.round((h * 60 + m) / GRAO_MIN) * GRAO_MIN);
  el.value = hm(ler());   // se o snap cair no mesmo valor, o DOM não repintaria sozinho
}
</script>

<template>
  <div v-if="sessao" class="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4"
       @click.self="emit('fechar')">
    <div class="painel w-full max-w-[400px] shadow-pop">
      <div class="border-b border-rule px-4 py-2.5">
        <div class="rot mb-0.5">corrigir sessão</div>
        <div class="truncate text-[14px] font-semibold">{{ sessao.title }}</div>
      </div>

      <div class="flex items-end gap-3 p-4">
        <label class="flex-1">
          <span class="rot mb-1 block">Início</span>
          <input class="inp med" type="time" :step="GRAO_MIN * 60" :value="hm(de)"
                 @change="ajusta($event.target, (m) => (de = m), () => de)">
        </label>
        <label class="flex-1">
          <span class="rot mb-1 block">Fim</span>
          <input class="inp med" type="time" :step="GRAO_MIN * 60" :value="hm(ate)"
                 @change="ajusta($event.target, (m) => (ate = m), () => ate)">
        </label>
        <div class="med pb-2 text-[14px] font-semibold"
             :class="ate > de ? 'text-fg-muted' : 'text-danger'">
          {{ ate > de ? fmtDur(ate - de) : 'inválido' }}
        </div>
      </div>

      <div class="flex items-center gap-2 border-t border-rule px-4 py-2.5">
        <button class="btn btn-perigo" @click="emit('excluir', sessao.id)">
          <Trash2 class="h-3.5 w-3.5" />Excluir
        </button>
        <div class="flex-1" />
        <button class="btn" @click="emit('fechar')">Cancelar</button>
        <button class="btn btn-accent" :disabled="ate <= de"
          @click="emit('salvar', sessao.id, { started_at: utcDe(dia, de), ended_at: utcDe(dia, ate) })">
          Salvar
        </button>
      </div>
    </div>
  </div>
</template>
