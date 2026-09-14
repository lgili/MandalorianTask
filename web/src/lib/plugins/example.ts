// The example plugin, bundled for the "Install the example plugin" button in Settings.
//
// The files come from examples/plugins/ at the repository root via `?raw` —
// the SAME copy a plugin author reads. No second version in here that would
// one day drift from the documented one.
import manifest from '../../../../examples/plugins/highlight-todo/manifest.json?raw';
import main from '../../../../examples/plugins/highlight-todo/main.js?raw';
import styles from '../../../../examples/plugins/highlight-todo/styles.css?raw';

export const EXAMPLE_PLUGIN = {
  id: 'highlight-todo',
  files: { 'manifest.json': manifest, 'main.js': main, 'styles.css': styles } as Record<string, string>,
};
