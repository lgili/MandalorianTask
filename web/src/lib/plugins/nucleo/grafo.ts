// Plugin de núcleo: Grafo.
//
// Toda nota é um ponto, todo [[link]] é uma linha. Ponto colorido pelo
// projeto da nota; link para nota que ainda não existe vira ponto fantasma.
// SVG e uma simulação de forças simples, sem biblioteca — é também o exemplo
// de painel com DOM puro que a documentação de plugins aponta.

import type { Bancada, DefinicaoPlugin, Manifesto } from '../tipos';

export const manifesto: Manifesto = {
  id: 'grafo',
  nome: 'Grafo',
  versao: '1.0.0',
  descricao: 'Mapa das notas e dos links entre elas, colorido por projeto.',
  autor: 'Bancada',
};

const NS = 'http://www.w3.org/2000/svg';

interface No {
  id: string; titulo: string; cor: string | null; fantasma: boolean;
  x: number; y: number; vx: number; vy: number; grau: number;
  circulo?: SVGCircleElement; rotulo?: SVGTextElement;
}
interface Aresta { a: No; b: No; linha?: SVGLineElement }

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function monta(host: HTMLElement, b: Bancada): () => void {
  host.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;cursor:grab';
  const svg = el('svg', { width: '100%', height: '100%' });
  const camada = el('g');
  const linhas = el('g');
  const pontos = el('g');
  camada.append(linhas, pontos);
  svg.appendChild(camada);
  host.appendChild(svg);

  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;left:16px;bottom:12px;font:11px "JetBrains Mono Variable",monospace;color:rgb(var(--fg-subtle));pointer-events:none';
  host.appendChild(info);

  let parado = false;
  let quadro = 0;
  /** A pessoa já mexeu na vista: a simulação para de reenquadrar por cima dela. */
  let mexeu = false;
  let zoom = 1;
  let desloc = { x: 0, y: 0 };
  const aplicaVista = () => camada.setAttribute('transform', `translate(${desloc.x} ${desloc.y}) scale(${zoom})`);

  const nos = new Map<string, No>();
  const arestas: Aresta[] = [];

  function vizinhos(n: No): Set<No> {
    const s = new Set<No>([n]);
    for (const a of arestas) { if (a.a === n) s.add(a.b); if (a.b === n) s.add(a.a); }
    return s;
  }

  function realca(n: No | null): void {
    const viz = n ? vizinhos(n) : null;
    for (const x of nos.values()) {
      const perto = !viz || viz.has(x);
      x.circulo!.style.opacity = perto ? '1' : '0.15';
      if (x.rotulo) x.rotulo.style.opacity = perto ? '1' : '0.1';
      if (x.rotulo) x.rotulo.style.display = n ? (perto ? '' : 'none') : x.rotulo.dataset.sempre === '1' ? '' : 'none';
    }
    for (const a of arestas) {
      const liga = !n || a.a === n || a.b === n;
      a.linha!.style.opacity = liga ? (n ? '0.9' : '0.35') : '0.05';
      a.linha!.style.stroke = liga && n ? 'rgb(var(--accent-ink))' : 'rgb(var(--rule-strong))';
    }
  }

  async function carrega(): Promise<void> {
    const notas = b.notas.lista();
    const ligacoes = await b.notas.ligacoes();
    if (parado) return;
    const cores = new Map(b.projetos.lista().map((p) => [p.id, p.cor]));
    const aberta = b.notas.aberta();

    notas.forEach((n, i) => {
      const ang = (i / Math.max(1, notas.length)) * Math.PI * 2;
      nos.set(n.path, {
        id: n.path, titulo: n.titulo, cor: n.projeto ? cores.get(n.projeto) ?? null : null, fantasma: false,
        x: Math.cos(ang) * 200, y: Math.sin(ang) * 200, vx: 0, vy: 0, grau: 0,
      });
    });
    const vistas = new Set<string>();
    for (const l of ligacoes) {
      const de = nos.get(l.de);
      if (!de) continue;
      const chave = l.para ?? `?${l.alvo}`;
      let para = nos.get(chave);
      if (!para) {
        para = { id: chave, titulo: l.alvo, cor: null, fantasma: true, x: de.x + 30, y: de.y + 30, vx: 0, vy: 0, grau: 0 };
        nos.set(chave, para);
      }
      if (para === de) continue;
      const par = [de.id, para.id].sort().join('|');
      if (vistas.has(par)) continue;
      vistas.add(par);
      arestas.push({ a: de, b: para });
      de.grau++; para.grau++;
    }

    for (const a of arestas) {
      a.linha = el('line', { 'stroke-width': 1 });
      a.linha.style.stroke = 'rgb(var(--rule-strong))';
      a.linha.style.opacity = '0.35';
      linhas.appendChild(a.linha);
    }
    const poucos = nos.size <= 60;
    for (const n of nos.values()) {
      const r = n.fantasma ? 3.5 : 4 + Math.min(8, Math.sqrt(n.grau) * 2);
      n.circulo = el('circle', { r });
      n.circulo.style.fill = n.fantasma ? 'transparent' : n.cor ? `rgb(var(--${n.cor}))` : 'rgb(var(--fg-muted))';
      n.circulo.style.stroke = n.fantasma ? 'rgb(var(--fg-subtle))' : n.id === aberta ? 'rgb(var(--fg))' : 'transparent';
      n.circulo.style.strokeWidth = n.id === aberta ? '2' : '1';
      if (n.fantasma) n.circulo.style.strokeDasharray = '2 2';
      n.circulo.style.cursor = 'pointer';
      n.circulo.addEventListener('mouseenter', () => realca(n));
      n.circulo.addEventListener('mouseleave', () => realca(null));
      n.circulo.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!n.fantasma) b.notas.abre(n.id);
        else b.ui.toast(`"${n.titulo}" ainda não existe — clique no link dentro de uma nota para criar.`, 'aviso');
      });
      pontos.appendChild(n.circulo);

      n.rotulo = el('text', { 'text-anchor': 'middle', 'font-size': 11 });
      n.rotulo.textContent = n.titulo;
      n.rotulo.style.fill = n.fantasma ? 'rgb(var(--fg-subtle))' : 'rgb(var(--fg-muted))';
      n.rotulo.style.fontFamily = '"Instrument Sans Variable", system-ui, sans-serif';
      n.rotulo.style.pointerEvents = 'none';
      n.rotulo.dataset.sempre = poucos || n.grau >= 3 ? '1' : '0';
      n.rotulo.style.display = n.rotulo.dataset.sempre === '1' ? '' : 'none';
      pontos.appendChild(n.rotulo);
    }

    const semLink = [...nos.values()].filter((n) => !n.fantasma && n.grau === 0).length;
    info.textContent = `${notas.length} notas · ${arestas.length} links${semLink ? ` · ${semLink} soltas` : ''} · roda o mouse para zoom, arraste para mover`;

    const { width, height } = host.getBoundingClientRect();
    desloc = { x: width / 2, y: height / 2 };
    aplicaVista();
    simula();
  }

  /**
   * Enquadra o grafo inteiro na tela, com folga. Sem isto o desenho nasce
   * deslocado e o que fica na borda (quase sempre os nós soltos) sai cortado.
   */
  function enquadra(): void {
    if (!nos.size) return;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const n of nos.values()) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
    }
    const { width, height } = host.getBoundingClientRect();
    const folga = 80;
    const w = Math.max(1, x1 - x0); const h = Math.max(1, y1 - y0);
    zoom = Math.min(2, Math.max(0.2, Math.min((width - folga * 2) / w, (height - folga * 2) / h)));
    desloc = { x: width / 2 - ((x0 + x1) / 2) * zoom, y: height / 2 - ((y0 + y1) / 2) * zoom };
    aplicaVista();
  }

  /**
   * Forças: todo par se repele, toda aresta puxa como mola, e uma gravidade
   * fraca segura tudo no centro. `calor` cai a cada quadro e a simulação para
   * sozinha — nada de CPU gasta num grafo que já assentou.
   */
  function simula(): void {
    let calor = 1;
    let quadros = 0;
    const lista = [...nos.values()];
    const passo = () => {
      if (parado) return;
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i];
        for (let j = i + 1; j < lista.length; j++) {
          const q = lista[j];
          let dx = p.x - q.x; let dy = p.y - q.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = (i - j) * 0.1; dy = 0.1; d2 = dx * dx + dy * dy; }
          if (d2 > 250000) continue;   // longe demais para importar
          const f = (900 / d2) * calor;
          p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
        }
      }
      for (const a of arestas) {
        const dx = a.b.x - a.a.x; const dy = a.b.y - a.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - 70) / d) * 0.04 * calor;
        a.a.vx += dx * f; a.a.vy += dy * f; a.b.vx -= dx * f; a.b.vy -= dy * f;
      }
      for (const n of lista) {
        n.vx -= n.x * 0.004 * calor; n.vy -= n.y * 0.004 * calor;
        n.x += n.vx; n.y += n.vy;
        n.vx *= 0.6; n.vy *= 0.6;
      }
      for (const a of arestas) {
        a.linha!.setAttribute('x1', a.a.x.toFixed(1)); a.linha!.setAttribute('y1', a.a.y.toFixed(1));
        a.linha!.setAttribute('x2', a.b.x.toFixed(1)); a.linha!.setAttribute('y2', a.b.y.toFixed(1));
      }
      for (const n of lista) {
        n.circulo!.setAttribute('cx', n.x.toFixed(1)); n.circulo!.setAttribute('cy', n.y.toFixed(1));
        n.rotulo!.setAttribute('x', n.x.toFixed(1)); n.rotulo!.setAttribute('y', (n.y - 12).toFixed(1));
      }
      calor *= 0.985;
      quadros++;
      // enquadra cedo (o desenho já tem forma) e de novo quando assenta
      if (!mexeu && (quadros === 45 || calor <= 0.01)) enquadra();
      if (calor > 0.01) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
  }

  // ── zoom e arrasto ──
  const roda = (e: WheelEvent) => {
    e.preventDefault();
    mexeu = true;
    const r = host.getBoundingClientRect();
    const mx = e.clientX - r.left; const my = e.clientY - r.top;
    const novo = Math.min(4, Math.max(0.2, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    desloc = { x: mx - ((mx - desloc.x) * novo) / zoom, y: my - ((my - desloc.y) * novo) / zoom };
    zoom = novo;
    aplicaVista();
  };
  let arrasto: { x: number; y: number; dx: number; dy: number } | null = null;
  const desce = (e: MouseEvent) => { mexeu = true; arrasto = { x: e.clientX, y: e.clientY, dx: desloc.x, dy: desloc.y }; host.style.cursor = 'grabbing'; };
  const move = (e: MouseEvent) => {
    if (!arrasto) return;
    desloc = { x: arrasto.dx + e.clientX - arrasto.x, y: arrasto.dy + e.clientY - arrasto.y };
    aplicaVista();
  };
  const sobe = () => { arrasto = null; host.style.cursor = 'grab'; };
  host.addEventListener('wheel', roda, { passive: false });
  host.addEventListener('mousedown', desce);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', sobe);

  void carrega();

  return () => {
    parado = true;
    cancelAnimationFrame(quadro);
    host.removeEventListener('wheel', roda);
    host.removeEventListener('mousedown', desce);
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', sobe);
    host.replaceChildren();
  };
}

export const definicao: DefinicaoPlugin = {
  aoLigar(b: Bancada) {
    b.ui.adicionaPainel({ id: 'grafo', titulo: 'Grafo', monta: (host) => monta(host, b) });
    b.comandos.adiciona({ id: 'abrir', nome: 'Abrir o grafo de notas', executa: () => b.ui.abrePainel('grafo') });
  },
};
