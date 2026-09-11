// O CONTRATO DE PLUGIN DO BANCADA.
//
// Este arquivo é a API pública: é o que um autor de plugin lê, e é o que o
// app promete não quebrar. Por isso ele não importa nada de dentro do app —
// os tipos daqui são DTOs próprios (NotaInfo, TarefaInfo…), não os tipos
// internos do banco. O app pode reorganizar o que quiser por dentro; enquanto
// este arquivo não mudar, nenhum plugin quebra.
//
// Autor de plugin: copie este arquivo como `bancada.d.ts` no seu projeto.
// Documentação e exemplo: docs/PLUGINS.md.

/** Versão do contrato. Muda o primeiro número = quebra plugin antigo. */
export const VERSAO_API = '1.0.0';

export interface Manifesto {
  /** Único, só letras minúsculas, números e hífen. É o nome da pasta. */
  id: string;
  nome: string;
  versao: string;
  descricao?: string;
  autor?: string;
  /** Versão mínima da API (VERSAO_API) que o plugin exige. */
  apiMinima?: string;
}

// ── dados que o plugin enxerga ─────────────────────────────────────────────

export interface NotaInfo {
  /** Caminho relativo ao vault, sempre com '/'. Ex.: 'Técnico/Snubber RCD.md' */
  path: string;
  titulo: string;
  /** ms desde a época. */
  editadaEm: number;
  /** id do projeto ligado pelo frontmatter `projeto:`, se houver. */
  projeto: number | null;
  tags: string[];
}

export type Status = 'backlog' | 'fila' | 'fazendo' | 'feito';

export interface TarefaInfo {
  id: number;
  titulo: string;
  status: Status;
  projeto: number | null;
  /** Minutos medidos em sessões fechadas. */
  minutos: number;
  /** ISO, ou null. */
  prazo: string | null;
  criadaEm: string;
}

export interface ProjetoInfo {
  id: number;
  nome: string;
  codigo: string | null;
  /** Token de cor: 'p1'..'p6'. Use `rgb(var(--p1))` no CSS. */
  cor: string | null;
}

export interface SessaoInfo {
  tarefa: number;
  titulo: string;
  projeto: number | null;
  inicio: string;
  /** null = rodando agora. */
  fim: string | null;
}

export interface Ligacao {
  /** Nota de onde sai o link. */
  de: string;
  /** Nota para onde aponta, ou null se o link aponta para nota que não existe. */
  para: string | null;
  /** O alvo como foi escrito (normalizado). */
  alvo: string;
}

// ── eventos ────────────────────────────────────────────────────────────────

export interface EventosPlugin {
  'nota:aberta': { path: string };
  'nota:salva': { path: string; texto: string };
  'nota:criada': { path: string };
  'nota:apagada': { path: string };
  'nota:renomeada': { de: string; para: string };
  'nota:externa': { path: string };
  'vault:sincronizado': { total: number };
  'tarefa:criada': { id: number; titulo: string; projeto: number | null };
  'tarefa:movida': { id: number; de: string | null; para: string };
  /** Só o Bancada tem isto: o momento em que o trabalho começa e para. */
  'sessao:iniciada': { tarefa: number; titulo: string };
  'sessao:encerrada': { tarefa: number | null };
}

// ── o que o plugin registra ────────────────────────────────────────────────

export interface ComandoPlugin {
  /** Único dentro do plugin — o app prefixa com o id do plugin. */
  id: string;
  nome: string;
  executa: () => void | Promise<void>;
}

export interface PainelPlugin {
  /** Único dentro do plugin. Vira a rota /plugin/<plugin>/<id>. */
  id: string;
  titulo: string;
  /**
   * Monta o painel dentro de `el` (DOM puro — use o framework que quiser).
   * Pode devolver uma função de limpeza, chamada quando o painel fecha.
   */
  monta: (el: HTMLElement) => void | (() => void);
}

// ── a API ──────────────────────────────────────────────────────────────────

export interface Bancada {
  readonly versaoApi: string;
  readonly plugin: { id: string; nome: string };

  comandos: {
    /** Aparece na paleta (Ctrl+P). Removido sozinho quando o plugin desliga. */
    adiciona(c: ComandoPlugin): void;
    /** Roda um comando do app ou de outro plugin pelo id completo. */
    executa(id: string): Promise<void>;
  };

  eventos: {
    /** Desinscrição automática quando o plugin desliga. */
    escuta<K extends keyof EventosPlugin>(nome: K, fn: (dado: EventosPlugin[K]) => void): void;
  };

  notas: {
    lista(): NotaInfo[];
    le(path: string): Promise<string>;
    /** Grava e reindexa. Cria a pasta se precisar. */
    escreve(path: string, texto: string): Promise<void>;
    /** Cria com nome único e devolve o caminho. */
    cria(titulo: string, op?: { pasta?: string; projeto?: string; corpo?: string }): Promise<string>;
    existe(path: string): Promise<boolean>;
    /** Abre a nota na tela de Notas. */
    abre(path: string): void;
    /** A nota aberta agora na tela de Notas, se houver. */
    aberta(): string | null;
    busca(termo: string): Promise<Array<{ path: string; titulo: string }>>;
    /** Todos os [[links]] do vault. Para grafo, índice, análise. */
    ligacoes(): Promise<Ligacao[]>;
    /** Para qual nota um `[[alvo]]` aponta (regra do Obsidian). */
    resolve(alvo: string): string | null;
  };

  tarefas: {
    lista(): TarefaInfo[];
    cria(t: { titulo: string; projeto?: number | null; prazo?: string | null; status?: Status }): Promise<number>;
    move(id: number, para: Status): Promise<void>;
    abre(id: number): void;
    /** A sessão rodando agora, se houver. */
    rodando(): SessaoInfo | null;
    /** Sessões de um dia local ('AAAA-MM-DD'; padrão: hoje). */
    sessoesDoDia(dia?: string): Promise<SessaoInfo[]>;
  };

  projetos: {
    lista(): ProjetoInfo[];
  };

  editor: {
    /**
     * Extensão do CodeMirror 6 para o editor de notas. Use as classes de
     * `bancada.cm` — um plugin carregado não consegue importar o CodeMirror
     * por conta própria, e duas cópias dele não conversam.
     */
    registraExtensao(ext: unknown): void;
  };

  /** Os módulos do CodeMirror 6 que o app usa: `view`, `state`, `language`. */
  readonly cm: { view: unknown; state: unknown; language: unknown };

  ui: {
    toast(mensagem: string, tom?: 'ok' | 'aviso' | 'erro'): void;
    /** Painel próprio, listado na barra lateral. */
    adicionaPainel(p: PainelPlugin): void;
    /** Navega para um painel deste plugin. */
    abrePainel(id: string): void;
    /** CSS injetado enquanto o plugin estiver ligado. */
    adicionaEstilo(css: string): void;
  };

  /** Configuração do plugin, gravada em .bancada/plugins/<id>/data.json. */
  dados: {
    carrega<T = unknown>(): Promise<T | null>;
    salva(dados: unknown): Promise<void>;
  };

  /** Registra qualquer limpeza extra para quando o plugin desligar. */
  aoDesligar(fn: () => void): void;
}

/**
 * O que `main.js` exporta como default: um objeto com `aoLigar`, ou uma
 * classe cujas instâncias têm `aoLigar`. `aoDesligar` é opcional — tudo que
 * foi registrado pela API é desfeito sozinho.
 */
export interface DefinicaoPlugin {
  aoLigar(bancada: Bancada): void | Promise<void>;
  aoDesligar?(): void;
}
