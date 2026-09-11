// Destaca TODO — plugin de exemplo do Bancada.
//
// Mostra as três portas mais usadas da API, em ~50 linhas:
//   1. uma extensão de editor (CodeMirror 6, pelas classes de bancada.cm)
//   2. um comando na paleta (Ctrl+P)
//   3. leitura e escrita de notas
//
// Instalar à mão: copie esta pasta inteira para <seu vault>/.bancada/plugins/
// e ligue em Ajustes > Plugins. Contrato completo: docs/PLUGINS.md.
//
// É JavaScript puro, módulo ES, sem import: tudo o que o plugin precisa
// chega pelo objeto `bancada`. Quer TypeScript? Escreva em TS com os tipos de
// web/src/lib/plugins/tipos.ts e compile para um main.js.

const MARCAS = /\b(TODO|FIXME|PERGUNTA)\b/g;
const TEM_MARCA = /\b(TODO|FIXME|PERGUNTA)\b/;

export default {
  aoLigar(bancada) {
    // ── 1. editor: pinta as palavras ────────────────────────────────────
    const { MatchDecorator, ViewPlugin, Decoration } = bancada.cm.view;
    const pintor = new MatchDecorator({
      regexp: MARCAS,
      decoration: (m) => Decoration.mark({ class: 'destaca-todo destaca-todo-' + m[1].toLowerCase() }),
    });
    bancada.editor.registraExtensao(ViewPlugin.fromClass(class {
      constructor(view) { this.decorations = pintor.createDeco(view); }
      update(u) { this.decorations = pintor.updateDeco(u, this.decorations); }
    }, { decorations: (v) => v.decorations }));

    // ── 2 e 3. comando que lê o vault e escreve uma nota ────────────────
    bancada.comandos.adiciona({
      id: 'listar',
      nome: 'Listar os TODO do vault numa nota',
      async executa() {
        const itens = [];
        for (const nota of bancada.notas.lista()) {
          if (nota.path === 'Pendências.md') continue;
          const texto = await bancada.notas.le(nota.path);
          for (const linha of texto.split('\n')) {
            if (!TEM_MARCA.test(linha)) continue;
            const limpa = linha.replace(/^\s*[-*+]\s*(\[.\]\s*)?/, '').trim();
            itens.push('- ' + limpa + ' — [[' + nota.path.replace(/\.md$/, '') + ']]');
          }
        }
        const corpo = itens.length ? itens.join('\n') : '_Nenhum TODO no vault._';
        await bancada.notas.escreve('Pendências.md', '## Pendências\n\n' + corpo + '\n');
        bancada.notas.abre('Pendências.md');
        bancada.ui.toast(itens.length + (itens.length === 1 ? ' pendência' : ' pendências'));
      },
    });
  },

  // Opcional. Tudo que foi registrado pela API já é desfeito sozinho.
  aoDesligar() {},
};
