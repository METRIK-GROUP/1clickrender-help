# Setup do viewport para render

O 1CR só funciona bem se o viewport estiver configurado corretamente. Os 3 ajustes críticos:

1. **Sombras ATIVADAS** — Janela → Sombras (ou Ctrl+Shift+S no Mac)
2. **Arestas VISÍVEIS** — Estilo: padrão arquitetônico (não usar "monocromático" nem "raio-X")
3. **Faces sólidas** — não usar wireframe

## Estilo recomendado

- Sombra: 11h da manhã, intensidade média
- Linhas: pretas, espessura 1
- Faces: cor sólida do material
- Fundo: branco ou azul claro

## Por que isso importa

A IA precisa "ver" sombras e arestas claras para entender volume e profundidade. Sem isso, o render fica plano ou inventa formas erradas.
