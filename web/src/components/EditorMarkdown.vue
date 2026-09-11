<script setup lang="ts">
// Editor de nota: CodeMirror 6 com live preview, [[links]] e #tags.
//
// O plano original (Notas.vue, v0.3) era <textarea> + preview, "CodeMirror
// só se incomodar". Incomodou por dois motivos: textarea não tem live preview
// — e sem ele escrever markdown parece editar código —, e plugin de editor
// precisa de um editor extensível. O Obsidian é CodeMirror 6 pelo mesmo motivo.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { WikiLink } from '../lib/editor/wikilink';
import { livePreview, redesenha, tags } from '../lib/editor/livePreview';
import { destaque, temaEditor } from '../lib/editor/tema';
import { completaLinks, type OpcaoLink } from '../lib/editor/autocompleta';
import { extensoesDePlugin } from '../lib/editor/extensoes';

const props = withDefaults(defineProps<{
  modelValue: string;
  /** Notas que o `[[` oferece. */
  opcoes: () => OpcaoLink[];
  /** A nota do link existe? */
  existe: (alvo: string) => boolean;
  /** Muda quando a lista de notas muda — força o redesenho dos links. */
  versaoNotas?: number;
  placeholder?: string;
}>(), { versaoNotas: 0, placeholder: 'Comece a escrever…' });

const emit = defineEmits<{
  'update:modelValue': [string];
  abreLink: [alvo: string];
  abreTag: [tag: string];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const plugins = new Compartment();

/**
 * Clique num link renderizado abre a nota. Na linha do cursor (onde o link
 * aparece cru, para ser editado) só Ctrl/Cmd+clique abre — senão não daria
 * para clicar no meio do link para corrigir uma letra.
 */
const cliques = EditorView.domEventHandlers({
  mousedown(e, v) {
    const alvo = (e.target as HTMLElement).closest<HTMLElement>('.cm-wikilink');
    const tag = (e.target as HTMLElement).closest<HTMLElement>('.cm-tag');
    if (!alvo && !tag) return false;
    const pos = v.posAtDOM(alvo ?? tag!);
    const linhaCursor = v.hasFocus && v.state.selection.ranges.some((r) =>
      v.state.doc.lineAt(r.head).number === v.state.doc.lineAt(pos).number);
    if (linhaCursor && !(e.ctrlKey || e.metaKey)) return false;
    e.preventDefault();
    if (alvo?.dataset.alvo) emit('abreLink', alvo.dataset.alvo);
    else if (tag?.dataset.tag) emit('abreTag', tag.dataset.tag);
    return true;
  },
});

onMounted(() => {
  view = new EditorView({
    parent: host.value!,
    state: EditorState.create({
      doc: props.modelValue,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        closeBrackets(),
        markdown({ base: markdownLanguage, extensions: [WikiLink] }),
        livePreview({ existe: (a) => props.existe(a) }),
        tags,
        destaque,
        temaEditor,
        autocompletion({ override: [completaLinks(() => props.opcoes())], icons: false }),
        placeholderExt(props.placeholder),
        cliques,
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
        }),
        plugins.of(extensoesDePlugin.value.map((x) => x.ext)),
      ],
    }),
  });
});

// Texto trocado por fora (outra nota aberta, arquivo editado no Obsidian):
// substitui o documento, mas mantém o cursor onde dá.
watch(() => props.modelValue, (novo) => {
  if (!view || novo === view.state.doc.toString()) return;
  const cab = Math.min(view.state.selection.main.head, novo.length);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: novo }, selection: { anchor: cab } });
});

watch(() => props.versaoNotas, () => view?.dispatch({ effects: redesenha.of(null) }));

watch(extensoesDePlugin, (lista) => {
  view?.dispatch({ effects: plugins.reconfigure(lista.map((x) => x.ext)) });
});

onBeforeUnmount(() => { view?.destroy(); view = null; });

defineExpose({
  foca: (fim = false) => {
    if (!view) return;
    view.focus();
    if (fim) view.dispatch({ selection: { anchor: view.state.doc.length } });
  },
});
</script>

<template>
  <div ref="host" class="editor-md" />
</template>
