// In-memory mirror of vault.fs.ts, for `pnpm dev:mock`.
//
// The sample notes link to each other AND to the db.mock projects (CF03B04,
// NACQ, INFRA) — it's the only way to judge the note screen with content that
// looks like real work, and to see backlinks, broken links and search.

export interface VaultFile { path: string; mtime: number; size: number }

const now = Date.now();
const hoursAgo = (hours: number) => now - hours * 3600_000;

const files = new Map<string, { text: string; mtime: number }>();
const put = (path: string, text: string, ageHours: number) =>
  files.set(path, { text: text.trimStart(), mtime: hoursAgo(ageHours) });

put('Home.md', `
Map of what's in progress. Each project has a parent note; meeting minutes
live in **Meetings/** and reusable knowledge in **Technical/**.

## Projects
- [[Flyback rev C]] — 65 W supply, board rev C
- [[NACQ 2026]] — component localization

## Knowledge
- [[RCD snubber]]
- [[Capacitor derating]]
- [[Thermal test]]
- [[LLC topology]] — not written yet

#index
`, 30);

put('Projects/Flyback rev C.md', `
---
project: CF03B04
tags: [power-supply, flyback]
---
**65 W** flyback supply, universal input. Rev C fixes the MOSFET heating
seen in the rev B [[Thermal test]] and replaces the clamp with a resized
[[RCD snubber]].

## Decisions
- Output capacitor: 2× 470 µF / 35 V, see [[Capacitor derating]]
- EE25 transformer kept — the problem was the snubber, not the core

## Open items
- [ ] measure the ripple on the 400 V bus with a differential probe
- [ ] check capacitor derating at 85 °C
- [x] simulate the snubber in LTspice

Minutes: [[2026-09-01 DFMEA review]]
`, 3);

put('Technical/RCD snubber.md', `
---
tags: [power-supply, snubber]
---
Clamps the voltage spike on the drain caused by the transformer's leakage
inductance. Used in [[Flyback rev C]].

## Sizing

The energy stored in the leakage inductance is dissipated in the resistor every cycle:

\`\`\`
P_R = ½ · L_lk · I_pk² · f_sw
\`\`\`

Rule of thumb: clamp voltage at **1.5×** the reflected voltage. Below
that the snubber steals useful energy; above it, the MOSFET blows.

## Pitfalls
- Slow diode = the spike gets through before the clamp. Use an ultrafast one.
- An undersized resistor runs hotter than the MOSFET — measure it in the [[Thermal test]].

#power-supply #switching
`, 20);

put('Technical/Capacitor derating.md', `
Electrolytic capacitor life **doubles every 10 °C** below the rated
temperature. A 105 °C / 2000 h capacitor running at 65 °C lasts ~32,000 h.

| Temperature | Estimated life |
|---|---|
| 105 °C | 2,000 h |
| 85 °C | 8,000 h |
| 65 °C | 32,000 h |

Voltage: run at **80% of rated at most**. See [[Flyback rev C]].

#components
`, 50);

put('Technical/Thermal test.md', `
Procedure for the 3 load points (25%, 50%, 100%).

1. Let it settle for 30 min at each point
2. Type K thermocouple on the MOSFET, on the output diode and on the [[RCD snubber]]
3. Record ΔT over ambient, not the absolute temperature

> On rev B the MOSFET went past 110 °C at 100% load. Cause: undersized
> snubber — see [[Flyback rev C]].

#test #procedure
`, 72);

put('Meetings/2026-09-01 DFMEA review.md', `
---
project: CF03B04
tags: [meeting, dfmea]
---
# DFMEA review — Flyback rev C

**Attendees:** hardware, quality, purchasing

## Points
- Failure mode "output capacitor dries out" went from RPN 120 to 180 after
  the [[Thermal test]]. Action: revisit [[Capacitor derating]].
- Snubber: the switch to RCD was approved — see [[RCD snubber]].

## Actions
- [ ] measure ripple on the 400 V bus
- [ ] add a snubber continuity test to the ATE
- [ ] check capacitor derating at 85 °C
`, 240);

put('Meetings/2026-09-08 Purchasing sync.md', `
---
project: NACQ
tags: [meeting]
---
# Weekly sync with purchasing

Imported isolated driver with a 26-week lead time. Local alternatives
under evaluation — see [[NACQ 2026]].

- [ ] request a sample of the UCC21540 isolated driver
- [ ] quote an alternative 47 µH inductor
`, 70);

put('Projects/NACQ 2026.md', `
---
project: NACQ
---
Localization of components with lead times over 12 weeks.

Last meeting: [[2026-09-08 Purchasing sync]]
`, 90);

put('Daily/2026-09-11.md', `
Morning on the flyback [[Thermal test]]. The snubber resistor reached 94 °C —
within what [[RCD snubber]] predicts, but close to the limit.

Afternoon: idea to study [[LLC topology]] for the next generation.

- TODO order one more type K thermocouple for the lab
- QUESTION is LLC worth it below 100 W?
`, 1);

let seq = 0;
const listeners = new Set<(p: string[]) => void>();

export async function getRoot(): Promise<string | null> { return 'C:\\Users\\you\\Documents\\Bancada'; }
export async function pickFolder(): Promise<string | null> { return getRoot(); }
export async function createDefaultVault(): Promise<string> { return (await getRoot())!; }

export async function listFiles(): Promise<VaultFile[]> {
  // Same rule as vault.fs: hidden folders (.trash, .obsidian) are left out.
  return [...files]
    .filter(([path]) => !path.split('/').some((seg) => seg.startsWith('.')))
    .map(([path, f]) => ({ path, mtime: f.mtime, size: f.text.length }));
}
export async function readFile(path: string): Promise<string> {
  const f = files.get(path);
  if (!f) throw new Error(`not found: ${path}`);
  return f.text;
}
export async function info(path: string): Promise<VaultFile> {
  const f = files.get(path);
  return { path, mtime: f?.mtime ?? Date.now(), size: f?.text.length ?? 0 };
}
export async function writeFile(path: string, text: string): Promise<VaultFile> {
  // strictly increasing mtime: two saves in the same ms must not tie
  files.set(path, { text, mtime: Date.now() + ++seq });
  return info(path);
}
export async function fileExists(path: string): Promise<boolean> { return files.has(path); }
export async function deleteFile(path: string): Promise<void> { files.delete(path); }
export async function renameFile(from: string, to: string): Promise<void> {
  const f = files.get(from);
  if (!f) return;
  files.delete(from);
  files.set(to, { ...f, mtime: Date.now() + ++seq });
}
export async function watchVault(cb: (paths: string[]) => void): Promise<() => void> {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ── plugins ────────────────────────────────────────────────────────────────
const internalFiles = new Map<string, string>();
export async function listPluginFolders(): Promise<string[]> {
  const ids = new Set<string>();
  for (const k of internalFiles.keys()) {
    const m = k.match(/^\.bancada\/plugins\/([^/]+)\//);
    if (m) ids.add(m[1]);
  }
  return [...ids];
}
export async function readInternalFile(rel: string): Promise<string | null> { return internalFiles.get(rel) ?? null; }
export async function writeInternalFile(rel: string, text: string): Promise<void> { internalFiles.set(rel, text); }
