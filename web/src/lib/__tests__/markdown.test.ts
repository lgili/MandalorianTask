import { describe, expect, it } from 'vitest';
import {
  alvosDe, arquivoPara, linksDe, nomeArquivo, normalizaAlvo, projetoDe, separaFrontmatter,
  semCodigo, tagsDe, textoParaBusca, tituloDe, trecho, trocaAlvo,
} from '../markdown';

describe('frontmatter', () => {
  it('separa YAML do corpo e conta as linhas', () => {
    const fm = separaFrontmatter('---\ntitle: Ata\nprojeto: CF03B04\n---\n# Corpo\n');
    expect(fm.dados).toEqual({ title: 'Ata', projeto: 'CF03B04' });
    expect(fm.corpo).toBe('# Corpo\n');
    expect(fm.linhas).toBe(4);
  });

  it('sem frontmatter, o texto inteiro é corpo', () => {
    expect(separaFrontmatter('# Só corpo').corpo).toBe('# Só corpo');
  });

  it('YAML quebrado não derruba a nota: vira corpo', () => {
    const fm = separaFrontmatter('---\ntitle: [aberto\n---\ntexto');
    expect(fm.dados).toEqual({});
    expect(fm.corpo).toContain('texto');
  });

  it('aceita CRLF, que é o que o Windows grava', () => {
    expect(separaFrontmatter('---\r\ntitle: X\r\n---\r\ncorpo').dados).toEqual({ title: 'X' });
  });
});

describe('título', () => {
  it('frontmatter ganha de cabeçalho, cabeçalho ganha de nome de arquivo', () => {
    expect(tituloDe('a.md', separaFrontmatter('---\ntitle: Do FM\n---\n# Do H1'))).toBe('Do FM');
    expect(tituloDe('a.md', separaFrontmatter('# Do H1\ntexto'))).toBe('Do H1');
    expect(tituloDe('Pasta/Do arquivo.md', separaFrontmatter('texto'))).toBe('Do arquivo');
  });

  it('`## ` não é título, e `# ` dentro de código também não', () => {
    expect(tituloDe('x.md', separaFrontmatter('## Seção\n```\n# comentario\n```'))).toBe('x');
  });
});

describe('links', () => {
  it('normaliza pasta, extensão, seção e apelido', () => {
    expect(normalizaAlvo('Flyback Rev C.md#Ensaio|o flyback')).toBe('flyback rev c');
    expect(normalizaAlvo('Projetos\\Flyback')).toBe('projetos/flyback');
  });

  it('extrai rótulo do apelido e marca embed', () => {
    const [a, b] = linksDe('ver [[Snubber RCD|o snubber]] e ![[diagrama.png]]');
    expect(a).toMatchObject({ alvo: 'snubber rcd', rotulo: 'o snubber', embed: false });
    expect(b.embed).toBe(true);
  });

  it('ignora link dentro de código', () => {
    expect(alvosDe('`[[falso]]` e\n```\n[[também falso]]\n```\n[[verdadeiro]]')).toEqual(['verdadeiro']);
  });

  it('não repete o mesmo alvo', () => {
    expect(alvosDe('[[A]] [[a]] [[A|outro]]')).toEqual(['a']);
  });
});

describe('tags', () => {
  it('junta frontmatter e corpo, sem # e em minúsculo', () => {
    const fm = separaFrontmatter('---\ntags: [Ata, reuniao]\n---\ntexto #Hardware e #fonte/flyback');
    expect(tagsDe(fm).sort()).toEqual(['ata', 'fonte/flyback', 'hardware', 'reuniao']);
  });

  it('número puro não é tag, e cabeçalho não é tag', () => {
    expect(tagsDe(separaFrontmatter('# Título\nversão #2026 e #v2'))).toEqual(['v2']);
  });

  it('aceita acento', () => {
    expect(tagsDe(separaFrontmatter('#reunião'))).toEqual(['reunião']);
  });
});

describe('projeto', () => {
  it('lê `projeto:` e aceita a forma de link do Obsidian', () => {
    expect(projetoDe(separaFrontmatter('---\nprojeto: CF03B04\n---\n'))).toBe('CF03B04');
    expect(projetoDe(separaFrontmatter('---\nprojeto: "[[NACQ]]"\n---\n'))).toBe('NACQ');
    expect(projetoDe(separaFrontmatter('sem fm'))).toBeNull();
  });
});

describe('arquivos', () => {
  it('nome de arquivo tira pasta e extensão', () => {
    expect(nomeArquivo('a/b/Nota Legal.md')).toBe('Nota Legal');
  });

  it('título vira nome seguro no Windows', () => {
    expect(arquivoPara('Ata: 12/09 — revisão?')).toBe('Ata 12 09 — revisão.md');
    expect(arquivoPara('  ...  ')).toBe('Sem título.md');
  });
});

describe('busca', () => {
  it('texto de busca troca link pelo rótulo e tira marcação', () => {
    expect(textoParaBusca(separaFrontmatter('**Ver** [[Snubber|o snubber]] `x`')))
      .toBe('Ver o snubber x');
  });

  it('trecho acha o termo ignorando acento', () => {
    expect(trecho('a ata da reunião de revisão do snubber', 'reuniao', 5)).toContain('reunião');
  });

  it('semCodigo preserva as quebras de linha, para número de linha continuar valendo', () => {
    const md = 'a\n```\nb\n```\nc';
    expect(semCodigo(md).split('\n')).toHaveLength(md.split('\n').length);
  });
});

describe('renomear reescreve links', () => {
  const antigos = ['snubber rcd', 'técnico/snubber rcd'];

  it('troca o alvo preservando seção e apelido', () => {
    expect(trocaAlvo('ver [[Snubber RCD#Dimensionamento|o snubber]]', antigos, 'Grampeador'))
      .toBe('ver [[Grampeador#Dimensionamento|o snubber]]');
  });

  it('acha pelo caminho também, e mantém embed', () => {
    expect(trocaAlvo('![[Técnico/Snubber RCD]]', antigos, 'Grampeador')).toBe('![[Grampeador]]');
  });

  it('ignora caixa e extensão, como o Obsidian', () => {
    expect(trocaAlvo('[[snubber rcd.md]]', antigos, 'Grampeador')).toBe('[[Grampeador]]');
  });

  it('não mexe em link de outra nota', () => {
    expect(trocaAlvo('[[Snubber RC]] e [[Flyback]]', antigos, 'X')).toBe('[[Snubber RC]] e [[Flyback]]');
  });

  it('não mexe em link dentro de código', () => {
    const md = '`[[Snubber RCD]]`\n```\n[[Snubber RCD]]\n```\n[[Snubber RCD]]';
    expect(trocaAlvo(md, antigos, 'G')).toBe('`[[Snubber RCD]]`\n```\n[[Snubber RCD]]\n```\n[[G]]');
  });
});
