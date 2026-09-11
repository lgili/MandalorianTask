# Plugins do Bancada

Um plugin é uma pasta com dois arquivos. Ele ganha acesso às suas notas, às tarefas, ao
quadro e — o que nenhum plugin de Obsidian tem — **ao tempo**: sabe quando uma tarefa entra
em *Fazendo* e quando a sessão de trabalho para.

- [Em 5 minutos](#em-5-minutos)
- [Estrutura](#estrutura)
- [A API](#a-api)
- [Eventos](#eventos)
- [Extensão de editor](#extensão-de-editor)
- [Painéis](#painéis)
- [Estilos](#estilos)
- [Segurança](#segurança)
- [Versão e compatibilidade](#versão-e-compatibilidade)
- [TypeScript](#typescript)
- [Depurar](#depurar)

---

## Em 5 minutos

1. No vault, crie `.bancada/plugins/ola/`.
2. Dentro, `manifest.json`:

   ```json
   { "id": "ola", "nome": "Olá", "versao": "1.0.0" }
   ```

3. E `main.js`:

   ```js
   export default {
     aoLigar(bancada) {
       bancada.comandos.adiciona({
         id: 'dizer',
         nome: 'Dizer olá',
         executa() {
           const n = bancada.tarefas.lista().filter((t) => t.status === 'fazendo').length;
           bancada.ui.toast(`Olá! ${n} tarefa(s) em curso.`);
         },
       });
     },
   };
   ```

4. **Ajustes → Plugins → Desligar modo restrito → Procurar de novo**, e ligue *Olá*.
5. **Ctrl+P** → "Dizer olá".

Um exemplo completo — extensão de editor, comando, leitura e escrita de notas, CSS — está em
[`exemplos/plugins/destaca-todo/`](../exemplos/plugins/destaca-todo/). Ajustes tem um botão que
o instala no seu vault.

---

## Estrutura

```
<vault>/.bancada/plugins/<id>/
├── manifest.json   obrigatório
├── main.js         obrigatório — módulo ES
├── styles.css      opcional — injetado enquanto o plugin estiver ligado
└── data.json       criado pelo próprio plugin via bancada.dados
```

Os plugins moram **dentro do vault**, como os do Obsidian em `.obsidian/plugins/`: vão junto
com as notas para o git, a nuvem, o outro computador.

### manifest.json

| campo | obrigatório | |
|---|---|---|
| `id` | sim | minúsculas, números e hífen, 2 a 49 caracteres. **Igual ao nome da pasta.** |
| `nome` | sim | o que aparece em Ajustes e na paleta |
| `versao` | sim | a do seu plugin |
| `descricao` | não | uma linha |
| `autor` | não | |
| `apiMinima` | não | versão da API que o plugin exige — ver [compatibilidade](#versão-e-compatibilidade) |

### main.js

Módulo ES, **sem `import`** — tudo chega pelo objeto `bancada`. Exporte como `default` um
objeto com `aoLigar`, ou uma classe cujas instâncias tenham `aoLigar`:

```js
export default {
  async aoLigar(bancada) { /* registre o que precisar */ },
  aoDesligar() { /* opcional */ },
};
```

**Você não precisa desfazer nada no `aoDesligar`.** Todo comando, ouvinte, painel, extensão e
estilo registrado pela API é removido sozinho quando o plugin desliga. `aoDesligar` existe para
o que você fez *por fora* da API (um `setInterval`, por exemplo) — e para isso também há
`bancada.aoDesligar(fn)`.

Se o `aoLigar` lançar erro, o plugin não liga, o que ele já tinha registrado é desfeito, e a
mensagem aparece em Ajustes → Plugins.

---

## A API

O contrato completo, com a documentação de cada campo, está em
[`web/src/lib/plugins/tipos.ts`](../web/src/lib/plugins/tipos.ts). Os dados que o plugin recebe
são **tipos próprios da API** (`NotaInfo`, `TarefaInfo`…), não os tipos internos do banco — o app
pode mudar por dentro sem quebrar plugin.

| área | o que tem |
|---|---|
| `bancada.comandos` | `adiciona({ id, nome, executa })` · `executa(id)` |
| `bancada.eventos` | `escuta(nome, fn)` — ver [eventos](#eventos) |
| `bancada.notas` | `lista()` · `le(path)` · `escreve(path, texto)` · `cria(titulo, { pasta, projeto, corpo })` · `existe(path)` · `abre(path)` · `aberta()` · `busca(termo)` · `ligacoes()` · `resolve(alvo)` |
| `bancada.tarefas` | `lista()` · `cria({ titulo, projeto, prazo, status })` · `move(id, status)` · `abre(id)` · `rodando()` · `sessoesDoDia(dia?)` |
| `bancada.projetos` | `lista()` |
| `bancada.editor` | `registraExtensao(ext)` — ver [extensão de editor](#extensão-de-editor) |
| `bancada.cm` | os módulos do CodeMirror 6 do app: `view`, `state`, `language` |
| `bancada.ui` | `toast(msg, tom)` · `adicionaPainel({ id, titulo, monta })` · `abrePainel(id)` · `adicionaEstilo(css)` |
| `bancada.dados` | `carrega()` · `salva(obj)` — gravado em `data.json` na pasta do plugin |
| `bancada.aoDesligar(fn)` | limpeza extra |

Caminhos de nota são **relativos ao vault, sempre com `/`**: `'Técnico/Snubber RCD.md'`.
Caminho com `..` é recusado.

`notas.escreve` grava o arquivo **e** reindexa — a busca e os backlinks já enxergam a mudança.
Se a nota estiver aberta no editor, ele adota o texto novo.

---

## Eventos

```js
bancada.eventos.escuta('sessao:iniciada', ({ tarefa, titulo }) => {
  bancada.ui.toast(`Foco em: ${titulo}`);
});
```

| evento | dado |
|---|---|
| `nota:aberta` | `{ path }` |
| `nota:salva` | `{ path, texto }` |
| `nota:criada` · `nota:apagada` | `{ path }` |
| `nota:renomeada` | `{ de, para }` |
| `nota:externa` | `{ path }` — mudou **por fora** do app (Obsidian, git, Dropbox) |
| `vault:sincronizado` | `{ total }` |
| `tarefa:criada` | `{ id, titulo, projeto }` |
| `tarefa:movida` | `{ id, de, para }` |
| **`sessao:iniciada`** | `{ tarefa, titulo }` — o trabalho começou |
| **`sessao:encerrada`** | `{ tarefa }` — parou (pausa, conclusão, ou outra tarefa começou) |

Os dois de sessão são o motivo de um plugin morar aqui e não no Obsidian: com eles dá para
fazer pomodoro que respeita o quadro, integração com calendário, "não perturbe" automático,
relatório de foco.

Um ouvinte que lança erro não derruba o app nem cala os outros ouvintes.

---

## Extensão de editor

O editor de notas é CodeMirror 6. Um plugin **não consegue importar o CodeMirror** (não há
resolução de módulos para um arquivo carregado do vault) — e mesmo que conseguisse, duas cópias
do CodeMirror não conversam. Por isso as classes chegam em `bancada.cm`:

```js
const { ViewPlugin, Decoration, MatchDecorator } = bancada.cm.view;

const pintor = new MatchDecorator({
  regexp: /\bURGENTE\b/g,
  decoration: () => Decoration.mark({ class: 'meu-urgente' }),
});

bancada.editor.registraExtensao(ViewPlugin.fromClass(class {
  constructor(view) { this.decorations = pintor.createDeco(view); }
  update(u) { this.decorations = pintor.updateDeco(u, this.decorations); }
}, { decorations: (v) => v.decorations }));
```

Ligar ou desligar o plugin reconfigura o editor aberto na hora, sem recarregar a nota.

**Regra de ouro do editor do Bancada:** decoração nunca altera o texto. O arquivo no disco tem
que continuar byte a byte o que a pessoa digitou — o Obsidian abre o mesmo vault.

---

## Painéis

Um painel é uma tela inteira do plugin, listada na barra lateral. Você recebe um elemento vazio
e faz o que quiser dentro: DOM puro, canvas, ou o seu framework empacotado junto.

```js
bancada.ui.adicionaPainel({
  id: 'resumo',
  titulo: 'Resumo da semana',
  monta(el) {
    el.innerHTML = '<h2 style="padding:24px">Carregando…</h2>';
    const t = setInterval(() => { /* … */ }, 1000);
    return () => clearInterval(t);   // limpeza ao sair do painel
  },
});
```

O plugin de núcleo **Grafo** ([`web/src/lib/plugins/nucleo/grafo.ts`](../web/src/lib/plugins/nucleo/grafo.ts))
é um painel escrito só com a API pública — SVG e DOM, sem biblioteca.

---

## Estilos

Use as variáveis de cor do app e o plugin segue os três temas sozinho:

```css
.meu-urgente { color: rgb(var(--danger)); background: rgb(var(--danger) / .12); }
```

| variável | papel |
|---|---|
| `--fg` · `--fg-muted` · `--fg-subtle` | texto |
| `--surface-1` · `--surface-2` · `--surface` · `--surface-3` | fundos, do chão ao hover |
| `--rule` · `--rule-strong` | bordas |
| `--accent` · `--accent-ink` | ação principal (`-ink` é para texto) |
| `--ok` · `--warn` · `--danger` | estados |
| `--p1` … `--p6` | cores de projeto (o `cor` de `ProjetoInfo`) |

Os valores são triplas RGB — sempre `rgb(var(--x))` ou `rgb(var(--x) / .2)`.

---

## Segurança

**Plugin roda com acesso total ao app**: lê e escreve notas, cria e move tarefas, e está na
mesma página que o banco. É o mesmo modelo do Obsidian. Só instale o que você confia.

O que o Bancada faz para isso ser uma escolha consciente:

- **Modo restrito é o padrão.** Plugin da comunidade não carrega até você desligá-lo — com um
  aviso explícito na frente.
- **A confiança é por vault e fica gravada no app**, não num arquivo do vault. Aqui divergimos
  do Obsidian de propósito: se ficasse no vault, um vault clonado de alguém chegaria com plugins
  já ligados e rodaria código na primeira abertura. No Bancada, vault novo abre restrito, sempre.
- Plugin que falha ao ligar não fica meio registrado: tudo o que ele já tinha feito é desfeito.
- `id` do manifesto é validado (sem `/`, sem `..`) e tem que ser o nome da pasta.

---

## Versão e compatibilidade

A API tem versão (`bancada.versaoApi`, hoje **1.0.0**). A regra:

- mesmo **número principal** = compatível; plugin feito para 1.x roda em qualquer 1.y com y ≥ x;
- mudou o número principal = contrato quebrou, plugin antigo é recusado com mensagem clara.

Declare no manifesto a menor versão que você usa: `"apiMinima": "1.0.0"`.

---

## TypeScript

Copie [`web/src/lib/plugins/tipos.ts`](../web/src/lib/plugins/tipos.ts) para o seu projeto como
`bancada.d.ts`, escreva o plugin em TS e compile para um `main.js` ES module:

```ts
import type { Bancada, DefinicaoPlugin } from './bancada';

const plugin: DefinicaoPlugin = {
  aoLigar(b: Bancada) {
    b.eventos.escuta('tarefa:movida', ({ id, para }) => { /* … */ });
  },
};
export default plugin;
```

`tipos.ts` não importa nada de dentro do app de propósito — é o contrato, sozinho.

---

## Depurar

- O erro de um plugin que não liga aparece em **Ajustes → Plugins**, embaixo do nome dele.
- Em `pnpm dev`, o DevTools do WebView abre com o botão direito → *Inspecionar*; `console.log`
  do plugin aparece lá.
- Editou o `main.js`? **Ajustes → Plugins → Procurar de novo** recarrega sem reiniciar o app.
- Para iterar sem Tauri: `pnpm dev:mock` roda o app no navegador com um vault de exemplo em
  memória, e o botão *Instalar o plugin de exemplo* funciona lá também.
