// Plugins que vêm com o app. Ligados por padrão; cada um pode ser desligado
// em Ajustes > Plugins, como os "core plugins" do Obsidian.
import type { DefinicaoPlugin, Manifesto } from '../tipos';
import * as notaDoDia from './notaDoDia';
import * as tarefasDaNota from './tarefasDaNota';
import * as grafo from './grafo';

export const NUCLEO: Array<{ manifesto: Manifesto; definicao: DefinicaoPlugin }> = [
  notaDoDia, tarefasDaNota, grafo,
];
