// Core plugin: Graph.
//
// Every note is a dot, every [[link]] is a line. Dots are colored by the
// note's project; a link to a note that doesn't exist yet becomes a ghost dot.
// SVG and a simple force simulation, no library — it's also the example of a
// plain-DOM panel that the plugin docs point to.

import type { Bancada, PluginDefinition, PluginManifest } from '../types';

export const manifest: PluginManifest = {
  id: 'graph',
  name: 'Graph',
  version: '1.0.0',
  description: 'Map of notes and the links between them, colored by project.',
  author: 'Bancada',
};

const NS = 'http://www.w3.org/2000/svg';

interface GraphNode {
  id: string; title: string; color: string | null; ghost: boolean;
  x: number; y: number; vx: number; vy: number; degree: number;
  circle?: SVGCircleElement; label?: SVGTextElement;
}
interface Edge { a: GraphNode; b: GraphNode; line?: SVGLineElement }

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

function mount(host: HTMLElement, b: Bancada): () => void {
  host.style.cssText = 'position:relative;width:100%;height:100%;overflow:hidden;cursor:grab';
  const svg = el('svg', { width: '100%', height: '100%' });
  const layer = el('g');
  const lines = el('g');
  const dots = el('g');
  layer.append(lines, dots);
  svg.appendChild(layer);
  host.appendChild(svg);

  const info = document.createElement('div');
  info.style.cssText = 'position:absolute;left:16px;bottom:12px;font:11px "JetBrains Mono Variable",monospace;color:rgb(var(--fg-subtle));pointer-events:none';
  host.appendChild(info);

  let stopped = false;
  let frame = 0;
  /** The person has already moved the view: the simulation stops reframing on top of them. */
  let userMoved = false;
  let zoom = 1;
  let offset = { x: 0, y: 0 };
  const applyView = () => layer.setAttribute('transform', `translate(${offset.x} ${offset.y}) scale(${zoom})`);

  const nodes = new Map<string, GraphNode>();
  const edges: Edge[] = [];

  function neighbors(n: GraphNode): Set<GraphNode> {
    const s = new Set<GraphNode>([n]);
    for (const a of edges) { if (a.a === n) s.add(a.b); if (a.b === n) s.add(a.a); }
    return s;
  }

  function highlight(n: GraphNode | null): void {
    const near = n ? neighbors(n) : null;
    for (const x of nodes.values()) {
      const isNear = !near || near.has(x);
      x.circle!.style.opacity = isNear ? '1' : '0.15';
      if (x.label) x.label.style.opacity = isNear ? '1' : '0.1';
      if (x.label) x.label.style.display = n ? (isNear ? '' : 'none') : x.label.dataset.always === '1' ? '' : 'none';
    }
    for (const a of edges) {
      const connected = !n || a.a === n || a.b === n;
      a.line!.style.opacity = connected ? (n ? '0.9' : '0.35') : '0.05';
      a.line!.style.stroke = connected && n ? 'rgb(var(--accent-ink))' : 'rgb(var(--rule-strong))';
    }
  }

  async function load(): Promise<void> {
    const notes = b.notes.list();
    const links = await b.notes.links();
    if (stopped) return;
    const colors = new Map(b.projects.list().map((p) => [p.id, p.color]));
    const active = b.notes.active();

    notes.forEach((n, i) => {
      const angle = (i / Math.max(1, notes.length)) * Math.PI * 2;
      nodes.set(n.path, {
        id: n.path, title: n.title, color: n.project ? colors.get(n.project) ?? null : null, ghost: false,
        x: Math.cos(angle) * 200, y: Math.sin(angle) * 200, vx: 0, vy: 0, degree: 0,
      });
    });
    const seen = new Set<string>();
    for (const l of links) {
      const from = nodes.get(l.from);
      if (!from) continue;
      const key = l.to ?? `?${l.target}`;
      let to = nodes.get(key);
      if (!to) {
        to = { id: key, title: l.target, color: null, ghost: true, x: from.x + 30, y: from.y + 30, vx: 0, vy: 0, degree: 0 };
        nodes.set(key, to);
      }
      if (to === from) continue;
      const pair = [from.id, to.id].sort().join('|');
      if (seen.has(pair)) continue;
      seen.add(pair);
      edges.push({ a: from, b: to });
      from.degree++; to.degree++;
    }

    for (const a of edges) {
      a.line = el('line', { 'stroke-width': 1 });
      a.line.style.stroke = 'rgb(var(--rule-strong))';
      a.line.style.opacity = '0.35';
      lines.appendChild(a.line);
    }
    const few = nodes.size <= 60;
    for (const n of nodes.values()) {
      const r = n.ghost ? 3.5 : 4 + Math.min(8, Math.sqrt(n.degree) * 2);
      n.circle = el('circle', { r });
      n.circle.style.fill = n.ghost ? 'transparent' : n.color ? `rgb(var(--${n.color}))` : 'rgb(var(--fg-muted))';
      n.circle.style.stroke = n.ghost ? 'rgb(var(--fg-subtle))' : n.id === active ? 'rgb(var(--fg))' : 'transparent';
      n.circle.style.strokeWidth = n.id === active ? '2' : '1';
      if (n.ghost) n.circle.style.strokeDasharray = '2 2';
      n.circle.style.cursor = 'pointer';
      n.circle.addEventListener('mouseenter', () => highlight(n));
      n.circle.addEventListener('mouseleave', () => highlight(null));
      n.circle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!n.ghost) b.notes.open(n.id);
        else b.ui.notice(`"${n.title}" doesn't exist yet — click the link inside a note to create it.`, 'warning');
      });
      dots.appendChild(n.circle);

      n.label = el('text', { 'text-anchor': 'middle', 'font-size': 11 });
      n.label.textContent = n.title;
      n.label.style.fill = n.ghost ? 'rgb(var(--fg-subtle))' : 'rgb(var(--fg-muted))';
      n.label.style.fontFamily = '"Instrument Sans Variable", system-ui, sans-serif';
      n.label.style.pointerEvents = 'none';
      n.label.dataset.always = few || n.degree >= 3 ? '1' : '0';
      n.label.style.display = n.label.dataset.always === '1' ? '' : 'none';
      dots.appendChild(n.label);
    }

    const orphans = [...nodes.values()].filter((n) => !n.ghost && n.degree === 0).length;
    info.textContent = `${notes.length} notes · ${edges.length} links${orphans ? ` · ${orphans} orphans` : ''} · scroll to zoom, drag to pan`;

    const { width, height } = host.getBoundingClientRect();
    offset = { x: width / 2, y: height / 2 };
    applyView();
    simulate();
  }

  /**
   * Fits the whole graph on screen, with some margin. Without this the drawing
   * starts off-center and whatever sits at the edge (almost always the orphan
   * nodes) gets cut off.
   */
  function fitToView(): void {
    if (!nodes.size) return;
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const n of nodes.values()) {
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
    }
    const { width, height } = host.getBoundingClientRect();
    const margin = 80;
    const w = Math.max(1, x1 - x0); const h = Math.max(1, y1 - y0);
    zoom = Math.min(2, Math.max(0.2, Math.min((width - margin * 2) / w, (height - margin * 2) / h)));
    offset = { x: width / 2 - ((x0 + x1) / 2) * zoom, y: height / 2 - ((y0 + y1) / 2) * zoom };
    applyView();
  }

  /**
   * Forces: every pair repels, every edge pulls like a spring, and a weak
   * gravity holds everything to the center. `heat` drops every frame and the
   * simulation stops on its own — no CPU spent on a graph that has settled.
   */
  function simulate(): void {
    let heat = 1;
    let frameCount = 0;
    const list = [...nodes.values()];
    const step = () => {
      if (stopped) return;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        for (let j = i + 1; j < list.length; j++) {
          const q = list[j];
          let dx = p.x - q.x; let dy = p.y - q.y;
          let d2 = dx * dx + dy * dy;
          if (d2 < 0.01) { dx = (i - j) * 0.1; dy = 0.1; d2 = dx * dx + dy * dy; }
          if (d2 > 250000) continue;   // too far away to matter
          const f = (900 / d2) * heat;
          p.vx += dx * f; p.vy += dy * f; q.vx -= dx * f; q.vy -= dy * f;
        }
      }
      for (const a of edges) {
        const dx = a.b.x - a.a.x; const dy = a.b.y - a.a.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = ((d - 70) / d) * 0.04 * heat;
        a.a.vx += dx * f; a.a.vy += dy * f; a.b.vx -= dx * f; a.b.vy -= dy * f;
      }
      for (const n of list) {
        n.vx -= n.x * 0.004 * heat; n.vy -= n.y * 0.004 * heat;
        n.x += n.vx; n.y += n.vy;
        n.vx *= 0.6; n.vy *= 0.6;
      }
      for (const a of edges) {
        a.line!.setAttribute('x1', a.a.x.toFixed(1)); a.line!.setAttribute('y1', a.a.y.toFixed(1));
        a.line!.setAttribute('x2', a.b.x.toFixed(1)); a.line!.setAttribute('y2', a.b.y.toFixed(1));
      }
      for (const n of list) {
        n.circle!.setAttribute('cx', n.x.toFixed(1)); n.circle!.setAttribute('cy', n.y.toFixed(1));
        n.label!.setAttribute('x', n.x.toFixed(1)); n.label!.setAttribute('y', (n.y - 12).toFixed(1));
      }
      heat *= 0.985;
      frameCount++;
      // fit early (the drawing already has a shape) and again once it settles
      if (!userMoved && (frameCount === 45 || heat <= 0.01)) fitToView();
      if (heat > 0.01) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  }

  // ── zoom and drag ──
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    userMoved = true;
    const r = host.getBoundingClientRect();
    const mx = e.clientX - r.left; const my = e.clientY - r.top;
    const next = Math.min(4, Math.max(0.2, zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
    offset = { x: mx - ((mx - offset.x) * next) / zoom, y: my - ((my - offset.y) * next) / zoom };
    zoom = next;
    applyView();
  };
  let drag: { x: number; y: number; dx: number; dy: number } | null = null;
  const onDown = (e: MouseEvent) => { userMoved = true; drag = { x: e.clientX, y: e.clientY, dx: offset.x, dy: offset.y }; host.style.cursor = 'grabbing'; };
  const onMove = (e: MouseEvent) => {
    if (!drag) return;
    offset = { x: drag.dx + e.clientX - drag.x, y: drag.dy + e.clientY - drag.y };
    applyView();
  };
  const onUp = () => { drag = null; host.style.cursor = 'grab'; };
  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);

  void load();

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    host.removeEventListener('wheel', onWheel);
    host.removeEventListener('mousedown', onDown);
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    host.replaceChildren();
  };
}

export const definition: PluginDefinition = {
  onload(b: Bancada) {
    b.ui.addPanel({ id: 'graph', title: 'Graph', mount: (host) => mount(host, b) });
    b.commands.add({ id: 'open', name: 'Open the note graph', run: () => b.ui.openPanel('graph') });
  },
};
