// Validação de plugin — puro, sem DOM, testado.
//
// É a primeira linha contra plugin malformado: um id com '..' ou '/' viraria
// caminho fora da pasta do plugin quando o app monta `.bancada/plugins/<id>/`.

import type { Manifesto } from './types';
import { VERSAO_API } from './types';

export const ID_VALIDO = /^[a-z0-9][a-z0-9-]{1,48}$/;

/** "1.2.0" cabe em `atual`? Mesmo número principal, e não maior que ele. */
export function compativel(minima: string | undefined, atual = VERSAO_API): boolean {
  if (!minima) return true;
  const [a, b, c] = atual.split('.').map(Number);
  const [x, y, z] = minima.split('.').map(Number);
  if ([x, y].some((n) => Number.isNaN(n))) return false;
  if (x !== a) return false;
  return y < b || (y === b && (z || 0) <= c);
}

export function validaManifesto(m: unknown, pasta: string, atual = VERSAO_API): Manifesto {
  const o = m as Partial<Manifesto> | null;
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('manifest.json não é um objeto');
  if (typeof o.id !== 'string' || !ID_VALIDO.test(o.id)) throw new Error(`id inválido: ${String(o.id)}`);
  if (o.id !== pasta) throw new Error(`id "${o.id}" não bate com a pasta "${pasta}"`);
  if (typeof o.nome !== 'string' || !o.nome.trim()) throw new Error('falta "nome"');
  if (typeof o.versao !== 'string' || !o.versao.trim()) throw new Error('falta "versao"');
  if (!compativel(o.apiMinima, atual)) throw new Error(`precisa da API ${o.apiMinima}; esta é a ${atual}`);
  return o as Manifesto;
}
