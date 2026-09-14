// Plugins that ship with the app. Enabled by default; each one can be disabled
// in Settings > Plugins, like Obsidian's "core plugins".
import type { PluginDefinition, PluginManifest } from '../types';
import * as dailyNote from './dailyNote';
import * as noteTasks from './noteTasks';
import * as graph from './graph';

export const CORE_PLUGINS: Array<{ manifest: PluginManifest; definition: PluginDefinition }> = [
  dailyNote, noteTasks, graph,
];
