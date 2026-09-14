// Plugin validation — pure, no DOM, tested.
//
// It is the first line of defense against a malformed plugin: an id with '..' or '/'
// would become a path outside the plugin's folder when the app builds `.bancada/plugins/<id>/`.

import type { PluginManifest } from './types';
import { API_VERSION } from './types';

export const VALID_ID = /^[a-z0-9][a-z0-9-]{1,48}$/;

/** Does "1.2.0" fit in `current`? Same major number, and not greater than it. */
export function isCompatible(minimum: string | undefined, current = API_VERSION): boolean {
  if (!minimum) return true;
  const [a, b, c] = current.split('.').map(Number);
  const [x, y, z] = minimum.split('.').map(Number);
  if ([x, y].some((n) => Number.isNaN(n))) return false;
  if (x !== a) return false;
  return y < b || (y === b && (z || 0) <= c);
}

export function validateManifest(m: unknown, folder: string, current = API_VERSION): PluginManifest {
  const o = m as Partial<PluginManifest> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('manifest.json is not an object');
  if (typeof o.id !== 'string' || !VALID_ID.test(o.id)) throw new Error(`invalid id: ${String(o.id)}`);
  if (o.id !== folder) throw new Error(`id "${o.id}" does not match the folder "${folder}"`);
  if (typeof o.name !== 'string' || !o.name.trim()) throw new Error('missing "name"');
  if (typeof o.version !== 'string' || !o.version.trim()) throw new Error('missing "version"');
  if (!isCompatible(o.minApiVersion, current)) throw new Error(`requires API ${o.minApiVersion}; this is ${current}`);
  return o as PluginManifest;
}
