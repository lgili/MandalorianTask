// Espelho de vault.fs.ts em memória, para `pnpm dev:mock`.
//
// As notas de exemplo se ligam entre si E aos projetos do db.mock (CF03B04,
// NACQ, INFRA) — é a única forma de avaliar a tela de nota com conteúdo que
// parece trabalho de verdade, e de ver backlink, link quebrado e busca.

export interface Arquivo { path: string; mtime: number; size: number }

const agora = Date.now();
const h = (horas: number) => agora - horas * 3600_000;

const arquivos = new Map<string, { texto: string; mtime: number }>();
const poe = (path: string, texto: string, horasAtras: number) =>
  arquivos.set(path, { texto: texto.trimStart(), mtime: h(horasAtras) });

poe('Início.md', `
Mapa do que está em andamento. Cada projeto tem uma nota-mãe; as atas de
reunião ficam em **Reuniões/** e o que é conhecimento reaproveitável em **Técnico/**.

## Projetos
- [[Flyback rev C]] — fonte de 65 W, rev C da placa
- [[NACQ 2026]] — nacionalização de componentes

## Conhecimento
- [[Snubber RCD]]
- [[Derating de capacitores]]
- [[Ensaio térmico]]
- [[Topologia LLC]] — ainda não escrevi

#índice
`, 30);

poe('Projetos/Flyback rev C.md', `
---
projeto: CF03B04
tags: [fonte, flyback]
---
Fonte flyback de **65 W**, entrada universal. A rev C corrige o aquecimento do
MOSFET visto no [[Ensaio térmico]] da rev B e troca o grampeador por um
[[Snubber RCD]] redimensionado.

## Decisões
- Capacitor de saída: 2× 470 µF / 35 V, ver [[Derating de capacitores]]
- Transformador EE25 mantido — o problema era o snubber, não o núcleo

## Pendências
- [ ] medir ripple no barramento de 400 V com ponteira diferencial
- [ ] conferir derating do capacitor a 85 °C
- [x] simular o snubber no LTspice

Atas: [[2026-09-01 Revisão DFMEA]]
`, 3);

poe('Técnico/Snubber RCD.md', `
---
tags: [fonte, snubber]
---
Grampeia o pico de tensão no dreno causado pela indutância de dispersão do
transformador. Usado no [[Flyback rev C]].

## Dimensionamento

A energia armazenada na dispersão é dissipada no resistor a cada ciclo:

\`\`\`
P_R = ½ · L_lk · I_pk² · f_sw
\`\`\`

Regra prática: tensão de grampeamento **1,5×** a tensão refletida. Abaixo
disso o snubber rouba energia útil; acima, o MOSFET estoura.

## Armadilhas
- Diodo lento = pico passa antes do grampeamento. Usar ultrarrápido.
- Resistor subdimensionado esquenta mais que o MOSFET — medir no [[Ensaio térmico]].

#fonte #chaveada
`, 20);

poe('Técnico/Derating de capacitores.md', `
Vida útil do eletrolítico **dobra a cada 10 °C** abaixo da temperatura
nominal. Um capacitor de 105 °C / 2000 h trabalhando a 65 °C dura ~32 000 h.

| Temperatura | Vida estimada |
|---|---|
| 105 °C | 2 000 h |
| 85 °C | 8 000 h |
| 65 °C | 32 000 h |

Tensão: trabalhar a **no máximo 80%** da nominal. Ver [[Flyback rev C]].

#componentes
`, 50);

poe('Técnico/Ensaio térmico.md', `
Procedimento para os 3 pontos de carga (25%, 50%, 100%).

1. Estabilizar 30 min em cada ponto
2. Termopar tipo K no MOSFET, no diodo de saída e no [[Snubber RCD]]
3. Registrar ΔT sobre a ambiente, não a temperatura absoluta

> Na rev B o MOSFET passou de 110 °C a 100% de carga. Causa: snubber
> subdimensionado — ver [[Flyback rev C]].

#ensaio #procedimento
`, 72);

poe('Reuniões/2026-09-01 Revisão DFMEA.md', `
---
projeto: CF03B04
tags: [reunião, dfmea]
---
# Revisão DFMEA — Flyback rev C

**Participantes:** hardware, qualidade, compras

## Pontos
- Modo de falha "capacitor de saída seca" subiu de RPN 120 para 180 depois
  do [[Ensaio térmico]]. Ação: revisar [[Derating de capacitores]].
- Snubber: aprovada a troca para RCD — ver [[Snubber RCD]].

## Ações
- [ ] medir ripple no barramento 400 V
- [ ] adicionar teste de continuidade do snubber no ATE
- [ ] conferir derating do capacitor a 85 °C
`, 240);

poe('Reuniões/2026-09-08 Alinhamento compras.md', `
---
projeto: NACQ
tags: [reunião]
---
# Alinhamento semanal com compras

Driver isolado importado com lead time de 26 semanas. Alternativas nacionais
em avaliação — ver [[NACQ 2026]].

- [ ] pedir amostra do driver isolado UCC21540
- [ ] cotar indutor alternativo de 47 µH
`, 70);

poe('Projetos/NACQ 2026.md', `
---
projeto: NACQ
---
Nacionalização de componentes com lead time acima de 12 semanas.

Última reunião: [[2026-09-08 Alinhamento compras]]
`, 90);

poe('Diário/2026-09-11.md', `
Manhã no [[Ensaio térmico]] do flyback. O resistor do snubber chegou a 94 °C —
dentro do previsto em [[Snubber RCD]], mas perto do limite.

Tarde: ideia de estudar [[Topologia LLC]] para a próxima geração.

- TODO pedir mais um termopar tipo K para o laboratório
- PERGUNTA o LLC compensa abaixo de 100 W?
`, 1);

let seq = 0;
const escuta = new Set<(p: string[]) => void>();

export async function raiz(): Promise<string | null> { return 'C:\\Users\\voce\\Documents\\Bancada'; }
export async function escolhePasta(): Promise<string | null> { return raiz(); }
export async function criaVaultPadrao(): Promise<string> { return (await raiz())!; }

export async function lista(): Promise<Arquivo[]> {
  // Mesma regra do vault.fs: pasta oculta (.trash, .obsidian) não entra.
  return [...arquivos]
    .filter(([path]) => !path.split('/').some((seg) => seg.startsWith('.')))
    .map(([path, a]) => ({ path, mtime: a.mtime, size: a.texto.length }));
}
export async function le(path: string): Promise<string> {
  const a = arquivos.get(path);
  if (!a) throw new Error(`não existe: ${path}`);
  return a.texto;
}
export async function info(path: string): Promise<Arquivo> {
  const a = arquivos.get(path);
  return { path, mtime: a?.mtime ?? Date.now(), size: a?.texto.length ?? 0 };
}
export async function escreve(path: string, texto: string): Promise<Arquivo> {
  // mtime estritamente crescente: dois saves no mesmo ms não podem empatar
  arquivos.set(path, { texto, mtime: Date.now() + ++seq });
  return info(path);
}
export async function existe(path: string): Promise<boolean> { return arquivos.has(path); }
export async function apaga(path: string): Promise<void> { arquivos.delete(path); }
export async function renomeia(de: string, para: string): Promise<void> {
  const a = arquivos.get(de);
  if (!a) return;
  arquivos.delete(de);
  arquivos.set(para, { ...a, mtime: Date.now() + ++seq });
}
export async function observa(cb: (paths: string[]) => void): Promise<() => void> {
  escuta.add(cb);
  return () => { escuta.delete(cb); };
}

// ── plugins ────────────────────────────────────────────────────────────────
const internos = new Map<string, string>();
export async function listaPastasDePlugin(): Promise<string[]> {
  const ids = new Set<string>();
  for (const k of internos.keys()) {
    const m = k.match(/^\.bancada\/plugins\/([^/]+)\//);
    if (m) ids.add(m[1]);
  }
  return [...ids];
}
export async function leArquivoInterno(rel: string): Promise<string | null> { return internos.get(rel) ?? null; }
export async function escreveArquivoInterno(rel: string, texto: string): Promise<void> { internos.set(rel, texto); }
