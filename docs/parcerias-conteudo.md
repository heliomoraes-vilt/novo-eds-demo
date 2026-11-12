# Catálogo de parcerias — o que vive na fonte de conteúdo

Os blocos `partner-catalog` e `network-insights` não trazem dado nenhum no código: leem uma
planilha publicada e as imagens servidas pela fonte de conteúdo. Este documento diz o que a
equipe de conteúdo precisa colocar lá e com que nomes, porque os blocos dependem disso.

## O que subir

```
<raiz da fonte de conteúdo>
├── parcerias.xlsx                 → publicado como /parcerias.json
└── assets/
    └── parcerias/
        ├── <slug>.webp            → foto do campus (138 arquivos)
        └── <slug>-logo.webp       → logo da instituição (131 arquivos)
```

A planilha é publicada como JSON no mesmo caminho, trocando a extensão: `parcerias.xlsx` na
raiz vira `/parcerias.json`, que é o valor padrão do campo `source` dos dois blocos. Se ela
for para outra pasta, o caminho precisa ser informado na tabela do bloco.

## A planilha

Três abas, todas obrigatórias.

### Aba `parceiros` — uma linha por instituição

| Coluna | Conteúdo | Usada em |
| --- | --- | --- |
| `slug` | identificador em minúsculas e hífens; casa com o nome dos arquivos de imagem | nomes de imagem |
| `institution` | nome da instituição | cartão, detalhe, busca, ordenação |
| `continent` | chave em inglês (`Europe`, `North America`…) | filtro, gráfico de regiões |
| `country` | chave em inglês (`United States`, `France`…) | filtro, cartão, ordenação |
| `city` | cidade; várias separadas por vírgula ou " e " | filtro, cartão |
| `campuses` | texto livre | detalhe |
| `population` | número | detalhe |
| `founded` | ano | detalhe, ordenação |
| `website` | domínio ou URL | botão "Site" |
| `degree` | grau acadêmico, texto livre | detalhe |
| `courses` | siglas separadas por vírgula (`ADM, ECO, DIR`) | filtro, cartão, gráfico de cursos |
| `partnerships` | modalidades, texto livre separado por vírgula | detalhe |
| `programs` | programas, texto livre separado por vírgula | detalhe |
| `categories` | chaves de oportunidade separadas por vírgula | filtro, tags, gráfico |
| `aacsb` `amba` `equis` `abet` | `true` ou `false` | filtro, tags, KPI de tríplice coroa |
| `lat` `lon` | coordenadas decimais | mapa (onda 3) |
| `photo` | `/assets/parcerias/<slug>.webp` | cartão, detalhe |
| `logo` | `/assets/parcerias/<slug>-logo.webp` | cartão, detalhe |
| `sourcePage` | página do guia de origem | rastreabilidade |

`continent` e `country` guardam a chave em inglês de propósito: o nome exibido vem da aba
`taxonomia`, então o rótulo muda com o idioma da página sem mexer nesta aba.

A coluna `categories` é o que o site antigo deduzia por casamento de texto sobre
`partnerships` e `programs`. Aqui ela é explícita, e quem edita decide. Valores aceitos:
`bilateral`, `unilateral`, `short`, `fast`, `double`, `progressive`, `research`, `special`.

### Aba `taxonomia` — uma linha por termo

| Coluna | Conteúdo |
| --- | --- |
| `tipo` | `curso`, `oportunidade`, `continente`, `pais` ou `acreditacao` |
| `chave` | a chave usada na aba `parceiros` (`ADM`, `bilateral`, `Europe`, `France`…) |
| `pt` | rótulo em português |
| `en` | rótulo em inglês |

Um termo que não estiver aqui aparece pela própria chave. É o lugar de corrigir uma tradução
ou renomear um curso, sem tocar em código.

### Aba `cidades` — uma linha por cidade com parceira

| Coluna | Conteúdo |
| --- | --- |
| `pais` | país, na mesma chave em inglês usada na aba `parceiros` |
| `cidade` | nome da cidade, igual ao que está em `city` |
| `lat` `lon` | coordenadas decimais |

É o que posiciona os marcadores quando o mapa entra num país. Uma cidade sem linha aqui
não ganha marcador — a instituição continua aparecendo no catálogo, só não no mapa. Ao
cadastrar uma parceira numa cidade nova, acrescente a linha correspondente.

## Imagens

Nomeadas pelo `slug` da linha, em `.webp`. A foto do campus é obrigatória; o logo é
opcional — 7 instituições não têm, e o cartão simplesmente não mostra o selo.

Não as coloque no repositório de código: elas são conteúdo, e servidas pela fonte entram no
pipeline de otimização do EDS (`createOptimizedPicture` pede as variações de largura).

## Depois de publicar

1. `/parcerias.json` responde e traz as três abas (`:names` com `parceiros`, `taxonomia`
   e `cidades`).
2. Uma imagem abre direto pela URL, por exemplo `/assets/parcerias/aarhus-university.webp`.
3. Na página, os indicadores batem com a base: hoje são 138 instituições, 37 países,
   7 regiões e 44 com AACSB + AMBA + EQUIS.

## Enquanto não estiver publicado

`test/parcerias.json` é uma cópia da planilha para o preview local, e `test/wave2.html`
aponta para ela. Ambos são ignorados pelo `.hlxignore` e não vão ao ar.
