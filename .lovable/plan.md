

# Gerar Imagem Visual do Fluxo do Sistema

## Objetivo
Criar uma funcao backend que usa IA para gerar uma imagem ilustrativa do fluxo do sistema Nosso Pacto, mostrando a configuracao inicial e o dia a dia do responsavel e da crianca.

## Abordagem

Criar uma Edge Function `generate-flow-image` que:
1. Usa o modelo `google/gemini-3-pro-image-preview` (melhor qualidade para imagens) para gerar uma imagem do fluxo
2. Salva a imagem gerada no Storage (bucket publico `flow-images`)
3. Retorna a URL publica da imagem

Criar tambem uma pagina simples `/fluxo` (ou botao no admin) para disparar a geracao e exibir o resultado.

## Detalhes Tecnicos

### 1. Criar bucket de Storage `flow-images`
- Bucket publico para que a imagem possa ser compartilhada/baixada

### 2. Edge Function `generate-flow-image`
- Usa o endpoint `https://ai.gateway.lovable.dev/v1/chat/completions`
- Modelo: `google/gemini-3-pro-image-preview`
- Prompt detalhado descrevendo o fluxo do Nosso Pacto em 3 fases:
  - Configuracao Inicial (cadastro, filhos, tarefas, recompensas, regras, contrato)
  - Dia a dia do Responsavel (aprovar tarefas, gerenciar resgates, acompanhar)
  - Dia a dia da Crianca (completar tarefas, ganhar moedas, resgatar recompensas, conquistas)
- Salva o base64 retornado como PNG no bucket
- Retorna a URL publica

### 3. Botao no AdminPanel
- Adicionar um botao "Gerar Imagem do Fluxo" no painel admin
- Ao clicar, chama a edge function
- Exibe a imagem gerada com opcao de download

### 4. Pagina publica `/fluxo` (opcional)
- Pagina simples que exibe a imagem gerada mais recente
- Util para compartilhar com interessados

## Arquivos a criar/modificar
- `supabase/functions/generate-flow-image/index.ts` (nova edge function)
- `src/pages/AdminPanel.tsx` (adicionar botao e visualizacao)
- Migration SQL para criar o bucket de storage

