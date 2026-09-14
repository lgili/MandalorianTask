<script setup lang="ts">
// Note editor: CodeMirror 6 with live preview, [[links]] and #tags.
//
// The original plan (Notes.vue, v0.3) was <textarea> + preview, "CodeMirror
// only if it gets in the way". It got in the way for two reasons: a textarea has
// no live preview — and without it writing markdown feels like editing code —, and
// editor plugins need an extensible editor. Obsidian is CodeMirror 6 for the same reason.
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder as placeholderExt, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from '@codemirror/autocomplete';
import { WikiLink } from '../lib/editor/wikilink';
import { livePreview, redraw, tags } from '../lib/editor/livePreview';
import { editorHighlight, editorTheme } from '../lib/editor/theme';
import { completeLinks, type LinkOption } from '../lib/editor/autocomplete';
import { pluginExtensions } from '../lib/editor/extensions';

const props = withDefaults(defineProps<{
  modelValue: string;
  /** Notes that `[[` offers. */
  linkOptions: () => LinkOption[];
  /** Does the linked note exist? */
  noteExists: (target: string) => boolean;
  /** Changes when the note list changes — forces the links to redraw. */
  notesVersion?: number;
  placeholder?: string;
}>(), { notesVersion: 0, placeholder: 'Start writing…' });

const emit = defineEmits<{
  'update:modelValue': [string];
  openLink: [target: string];
  openTag: [tag: string];
}>();

const host = ref<HTMLDivElement | null>(null);
let view: EditorView | null = null;
const plugins = new Compartment();

/**
 * Clicking a rendered link opens the note. On the cursor line (where the link
 * shows raw, to be edited) only Ctrl/Cmd+click opens — otherwise there would be
 * no way to click in the middle of the link to fix a letter.
 */
const clickHandlers = EditorView.domEventHandlers({
  mousedown(e, v) {
    const link = (e.target as HTMLElement).closest<HTMLElement>('.cm-wikilink');
    const tag = (e.target as HTMLElement).closest<HTMLElement>('.cm-tag');
    if (!link && !tag) return false;
    const pos = v.posAtDOM(link ?? tag!);
    const onCursorLine = v.hasFocus && v.state.selection.ranges.some((r) =>
      v.state.doc.lineAt(r.head).number === v.state.doc.lineAt(pos).number);
    if (onCursorLine && !(e.ctrlKey || e.metaKey)) return false;
    e.preventDefault();
    if (link?.dataset.target) emit('openLink', link.dataset.target);
    else if (tag?.dataset.tag) emit('openTag', tag.dataset.tag);
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
        livePreview({ noteExists: (t) => props.noteExists(t) }),
        tags,
        editorHighlight,
        editorTheme,
        autocompletion({ override: [completeLinks(() => props.linkOptions())], icons: false }),
        placeholderExt(props.placeholder),
        clickHandlers,
        keymap.of([...closeBracketsKeymap, ...completionKeymap, ...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
        }),
        plugins.of(pluginExtensions.value.map((x) => x.ext)),
      ],
    }),
  });
});

// Text replaced from outside (another note opened, file edited in Obsidian):
// swap the document, but keep the cursor where possible.
watch(() => props.modelValue, (text) => {
  if (!view || text === view.state.doc.toString()) return;
  const head = Math.min(view.state.selection.main.head, text.length);
  view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text }, selection: { anchor: head } });
});

watch(() => props.notesVersion, () => view?.dispatch({ effects: redraw.of(null) }));

watch(pluginExtensions, (list) => {
  view?.dispatch({ effects: plugins.reconfigure(list.map((x) => x.ext)) });
});

onBeforeUnmount(() => { view?.destroy(); view = null; });

defineExpose({
  focus: (atEnd = false) => {
    if (!view) return;
    view.focus();
    if (atEnd) view.dispatch({ selection: { anchor: view.state.doc.length } });
  },
});
</script>

<template>
  <div ref="host" class="editor-md" />
</template>
