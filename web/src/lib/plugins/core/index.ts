// Plugins que vêm com o app. Ligados por padrão; cada um pode ser desligado
// em Ajustes > Plugins, como os "core plugins" do Obsidian.
import type { DefinicaoPlugin, Manifesto } from '../types';
import * as notaDoDia from './dailyNote';
import * as tarefasDaNota from './noteTasks';
import * as grafo from './graph';

export const NUCLEO: Array<{ manifesto: Manifesto; definicao: DefinicaoPlugin }> = [
  notaDoDia, tarefasDaNota, grafo,
];
