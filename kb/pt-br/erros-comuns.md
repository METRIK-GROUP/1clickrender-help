# Erros comuns e como resolver

## "Host não é conhecido" (Windows)

Causa: firewall ou antivírus bloqueando SketchUp.exe.

Como resolver:
1. Abra o Windows Defender (ou seu antivírus)
2. Vá em "Permitir aplicativo pelo firewall"
3. Adicione SketchUp.exe (geralmente em `C:\Program Files\SketchUp\SketchUp 2024\`)
4. Marque "Privado" e "Público"
5. Reinicie o SketchUp

Se persistir: desative temporariamente o antivírus e teste. Se funcionar, adicione exceção permanente.

## Plugin trava ao gerar render

Causa comum: imagem do viewport muito grande (>4K).

Como resolver: reduza a janela do SketchUp antes de gerar (max 2560x1440).

## "Falha na conexão"

Causa: internet instável ou bloqueio corporativo.

Como resolver:
1. Teste em outra rede (ex: hotspot do celular)
2. Se for rede corporativa, peça pra liberar `*.supabase.co` e `*.googleapis.com`

## Render saiu errado (geometria diferente)

Causa quase sempre: viewport mal configurado.

Confira [viewport.md](viewport.md). Os 3 ajustes obrigatórios resolvem 90% dos casos.
