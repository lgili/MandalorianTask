// O plugin de exemplo, embutido para o botão "Instalar exemplo" de Ajustes.
//
// Os arquivos vêm de exemplos/plugins/ na raiz do repositório via `?raw` —
// a MESMA cópia que um autor de plugin lê. Nada de uma segunda versão aqui
// dentro que um dia divergiria da documentada.
import manifesto from '../../../../examples/plugins/highlight-todo/manifest.json?raw';
import main from '../../../../examples/plugins/highlight-todo/main.js?raw';
import estilos from '../../../../examples/plugins/highlight-todo/styles.css?raw';

export const EXEMPLO = {
  id: 'destaca-todo',
  arquivos: { 'manifest.json': manifesto, 'main.js': main, 'styles.css': estilos } as Record<string, string>,
};
