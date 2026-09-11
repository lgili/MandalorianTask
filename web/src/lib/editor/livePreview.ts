// Live preview: o markdown aparece formatado, e a sintaxe só volta na linha
// onde está o cursor. É o modo padrão do Obsidian, e é o que faz um editor de
// texto puro parecer um editor de documento sem nunca mexer no arquivo.
//
// Regra única: TEXTO NUNCA É ALTERADO para exibir. Tudo aqui é decoração —
// esconder, marcar, trocar por widget na tela. O arquivo no disco continua
// byte a byte o que a pessoa digitou, e o Obsidian abre igual.

import {
  Decoration, EditorView, MatchDecorator, ViewPlugin, WidgetType,
  type DecorationSet, type ViewUpdate,
} from '@codemirror/view';
import { StateEffect, type Range } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';

/** O componente dispara isto quando a lista de notas muda (link quebrado acende). */
export const redesenha = StateEffect.define<null>();

export interface OpcoesPreview {
  /** A nota do link existe? Link para nota inexistente aparece apagado. */
  existe: (alvo: string) => boolean;
}

// ── widgets ────────────────────────────────────────────────────────────────

class Caixa extends WidgetType {
  constructor(readonly marcada: boolean, readonly pos: number) { super(); }
  eq(o: Caixa): boolean { return o.marcada === this.marcada && o.pos === this.pos; }
  toDOM(view: EditorView): HTMLElement {
    const el = document.createElement('input');
    el.type = 'checkbox';
    el.checked = this.marcada;
    el.className = 'cm-caixa';
    el.setAttribute('aria-label', this.marcada ? 'Desmarcar' : 'Marcar');
    // mousedown não pode mover o cursor para a linha — senão a sintaxe
    // aparece bem na hora do clique e o checkbox some embaixo do dedo.
    el.addEventListener('mousedown', (e) => e.preventDefault());
    el.addEventListener('click', (e) => {
      e.preventDefault();
      view.dispatch({ changes: { from: this.pos + 1, to: this.pos + 2, insert: this.marcada ? ' ' : 'x' } });
    });
    return el;
  }
  ignoreEvent(): boolean { return false; }
}

class Marcador extends WidgetType {
  eq(): boolean { return true; }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-marcador';
    el.textContent = '•';
    return el;
  }
}

class Regua extends WidgetType {
  eq(): boolean { return true; }
  toDOM(): HTMLElement {
    const el = document.createElement('span');
    el.className = 'cm-regua';
    return el;
  }
}

const esconde = Decoration.replace({});
const marca = (cls: string, attrs?: Record<string, string>) => Decoration.mark({ class: cls, attributes: attrs });
const linha = (cls: string) => Decoration.line({ class: cls });

// ── linhas ativas ──────────────────────────────────────────────────────────

/**
 * Linhas onde a sintaxe aparece crua: as tocadas por alguma seleção. Sem
 * foco, nenhuma — o editor parado mostra o documento inteiro formatado.
 */
function linhasAtivas(view: EditorView): Set<number> {
  const s = new Set<number>();
  if (!view.hasFocus) return s;
  for (const r of view.state.selection.ranges) {
    const a = view.state.doc.lineAt(r.from).number;
    const b = view.state.doc.lineAt(r.to).number;
    for (let i = a; i <= b; i++) s.add(i);
  }
  return s;
}

/** Fim do frontmatter (offset), ou 0. O parser vê `---` como setext/hr. */
function fimDoFrontmatter(view: EditorView): number {
  const doc = view.state.doc;
  if (doc.lines < 2 || doc.line(1).text !== '---') return 0;
  for (let i = 2; i <= Math.min(doc.lines, 200); i++) {
    if (doc.line(i).text === '---') return doc.line(i).to;
  }
  return 0;
}

interface Construcao {
  todas: DecorationSet;
  /**
   * Só o que foi ESCONDIDO ou trocado por widget. É isto que vira faixa
   * atômica para o cursor — se as marcações entrassem aqui, uma palavra em
   * negrito inteira viraria um bloco que o cursor pula de uma vez.
   */
  ocultas: DecorationSet;
}

function constroi(view: EditorView, op: OpcoesPreview): Construcao {
  const ativas = linhasAtivas(view);
  const doc = view.state.doc;
  const naAtiva = (pos: number) => ativas.has(doc.lineAt(pos).number);
  const out: Range<Decoration>[] = [];
  const sumiu: Range<Decoration>[] = [];
  const fmFim = fimDoFrontmatter(view);
  const oculta = (de: number, ate: number) => {
    if (de >= ate) return;
    const r = esconde.range(de, ate);
    out.push(r); sumiu.push(r);
  };
  const troca = (w: WidgetType, de: number, ate: number) => {
    const r = Decoration.replace({ widget: w }).range(de, ate);
    out.push(r); sumiu.push(r);
  };

  // Frontmatter: bloco apagado e monoespaçado — as propriedades da nota.
  if (fmFim) {
    for (let i = 1; doc.line(i).to <= fmFim; i++) {
      const l = doc.line(i);
      out.push(linha(i === 1 ? 'cm-fm cm-fm-ini' : l.to === fmFim ? 'cm-fm cm-fm-fim' : 'cm-fm').range(l.from));
      if (l.to === fmFim) break;
    }
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(no) {
        if (no.from < fmFim) return no.to <= fmFim ? false : undefined;
        const nome = no.name;

        // cabeçalhos: a linha ganha a classe; os `#` somem fora do cursor
        const h = nome.match(/^(?:ATX|Setext)Heading(\d)$/);
        if (h) { out.push(linha(`cm-h cm-h${h[1]}`).range(doc.lineAt(no.from).from)); return; }
        if (nome === 'HeaderMark') {
          if (naAtiva(no.from)) return;
          const fimMarca = doc.sliceString(no.to, no.to + 1) === ' ' ? no.to + 1 : no.to;
          if (no.from !== fimMarca) oculta(no.from, fimMarca);
          return;
        }

        if (nome === 'StrongEmphasis') { out.push(marca('cm-forte').range(no.from, no.to)); return; }
        if (nome === 'Emphasis') { out.push(marca('cm-italico').range(no.from, no.to)); return; }
        if (nome === 'Strikethrough') { out.push(marca('cm-riscado').range(no.from, no.to)); return; }
        if (nome === 'EmphasisMark' || nome === 'StrikethroughMark') {
          if (!naAtiva(no.from)) oculta(no.from, no.to);
          return;
        }

        if (nome === 'InlineCode') { out.push(marca('cm-codigo').range(no.from, no.to)); return; }
        if (nome === 'CodeMark') {
          // Só a crase do código em linha some; a cerca ``` do bloco fica.
          if (no.node.parent?.name === 'InlineCode' && !naAtiva(no.from)) oculta(no.from, no.to);
          return;
        }
        if (nome === 'FencedCode' || nome === 'CodeBlock') {
          const a = doc.lineAt(no.from).number;
          const b = doc.lineAt(no.to).number;
          for (let i = a; i <= b; i++) {
            const cls = i === a ? 'cm-bloco cm-bloco-ini' : i === b ? 'cm-bloco cm-bloco-fim' : 'cm-bloco';
            out.push(linha(cls).range(doc.line(i).from));
          }
          return false;   // nada de decorar markdown dentro de código
        }

        if (nome === 'Blockquote') {
          const a = doc.lineAt(no.from).number;
          const b = doc.lineAt(no.to).number;
          for (let i = a; i <= b; i++) out.push(linha('cm-citacao').range(doc.line(i).from));
          return;
        }
        if (nome === 'QuoteMark') {
          if (!naAtiva(no.from)) {
            const fim = doc.sliceString(no.to, no.to + 1) === ' ' ? no.to + 1 : no.to;
            oculta(no.from, fim);
          }
          return;
        }

        if (nome === 'HorizontalRule') {
          if (!naAtiva(no.from)) troca(new Regua(), no.from, no.to);
          return;
        }

        if (nome === 'TaskMarker') {
          const txt = doc.sliceString(no.from, no.to);
          const cursorDentro = view.state.selection.ranges.some((r) => r.from > no.from && r.from < no.to);
          if (!cursorDentro) {
            troca(new Caixa(/x/i.test(txt), no.from), no.from, no.to);
          }
          if (/x/i.test(txt)) {
            const l = doc.lineAt(no.from);
            if (no.to < l.to) out.push(marca('cm-feita').range(no.to, l.to));
          }
          return;
        }
        if (nome === 'ListMark') {
          if (naAtiva(no.from)) return;
          const marcaTxt = doc.sliceString(no.from, no.to);
          if (!/^[-*+]$/.test(marcaTxt)) return;   // lista numerada mantém o número
          const depois = doc.sliceString(no.to, no.to + 4);
          // item de tarefa: o `- ` some, fica só a caixa (como no Obsidian)
          if (/^ \[[ xX]\]/.test(depois)) oculta(no.from, no.to + 1);
          else troca(new Marcador(), no.from, no.to);
          return;
        }

        if (nome === 'Link') {
          out.push(marca('cm-link').range(no.from, no.to));
          if (naAtiva(no.from)) return;
          // [texto](url): some o `[` e tudo de `](` até `)`
          const marcas: Array<{ from: number; to: number }> = [];
          for (let c = no.node.firstChild; c; c = c.nextSibling) {
            if (c.name === 'LinkMark' || c.name === 'URL' || c.name === 'LinkTitle') marcas.push({ from: c.from, to: c.to });
          }
          if (marcas.length >= 2 && doc.sliceString(marcas[0].from, marcas[0].to) === '[') {
            oculta(marcas[0].from, marcas[0].to);
            const fecha = marcas.find((m, i) => i > 0 && doc.sliceString(m.from, m.to) === ']');
            if (fecha && fecha.from < no.to) oculta(fecha.from, no.to);
          }
          return false;
        }

        if (nome === 'WikiLink') {
          const bruto = doc.sliceString(no.from, no.to);
          const embed = bruto.startsWith('!');
          const miolo = bruto.slice(embed ? 3 : 2, -2);
          const alvo = miolo.split('|')[0].split('#')[0].trim();
          const ok = op.existe(alvo);
          out.push(marca(ok ? 'cm-wikilink' : 'cm-wikilink cm-wikilink-quebrado', { 'data-alvo': alvo }).range(no.from, no.to));
          if (naAtiva(no.from)) return false;
          const ini = no.from + (embed ? 3 : 2);
          const barra = miolo.indexOf('|');
          // `[[alvo|apelido]]`: mostra só o apelido
          oculta(no.from, barra >= 0 ? ini + barra + 1 : ini);
          oculta(no.to - 2, no.to);
          return false;
        }
        return undefined;
      },
    });
  }

  return { todas: Decoration.set(out, true), ocultas: Decoration.set(sumiu, true) };
}

export function livePreview(op: OpcoesPreview) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet;
    ocultas: DecorationSet;
    constructor(view: EditorView) {
      const c = constroi(view, op);
      this.decorations = c.todas; this.ocultas = c.ocultas;
    }
    update(u: ViewUpdate): void {
      const pediu = u.transactions.some((tr) => tr.effects.some((e) => e.is(redesenha)));
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged || pediu
          || syntaxTree(u.startState) !== syntaxTree(u.state)) {
        const c = constroi(u.view, op);
        this.decorations = c.todas; this.ocultas = c.ocultas;
      }
    }
  }, {
    decorations: (v) => v.decorations,
    // Sintaxe escondida vira faixa atômica: sem isto o cursor "entra" num
    // `**` invisível e parece travar por uma tecla.
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.ocultas ?? Decoration.none),
  });
}

// ── #tags ──────────────────────────────────────────────────────────────────
// Não é nó da gramática (o CommonMark não tem tag), então vai por regex.
// Mesma regra de markdown.ts: precisa de ao menos uma letra.

const tagDeco = new MatchDecorator({
  regexp: /(?<=^|[\s(])#(?=[\p{L}\p{N}_\-/]*[\p{L}_\-/])[\p{L}\p{N}_\-/]+/gu,
  decoration: (m) => marca('cm-tag', { 'data-tag': m[0].slice(1) }),
});

export const tags = ViewPlugin.fromClass(class {
  decorations: DecorationSet;
  constructor(view: EditorView) { this.decorations = tagDeco.createDeco(view); }
  update(u: ViewUpdate): void { this.decorations = tagDeco.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations });
