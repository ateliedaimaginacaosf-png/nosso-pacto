

# Plano: Sistema de Mesada — Implementacao Completa

## 1. Banco de Dados (Migration)

**Novas colunas em `contrato_versao`:**
- `usar_recompensas boolean NOT NULL DEFAULT true`
- `usar_mesada boolean NOT NULL DEFAULT false`
- `valor_mesada numeric(10,2) DEFAULT NULL`

**Novas colunas em `configuracao_familia`:**
- `usar_recompensas boolean NOT NULL DEFAULT true`
- `usar_mesada boolean NOT NULL DEFAULT false`
- `valor_mesada numeric(10,2) DEFAULT NULL`

**Atualizar trigger `sync_contrato_to_config`** para sincronizar os 3 campos quando status muda para `vigente`.

---

## 2. Contrato de Autonomia — Editor do Responsavel (`responsavel/ContratoAutonomia.tsx`)

Adicionar secao **"Modelo de Incentivo"** no formulario de criacao/edicao:
- Checkbox "Esquema de Recompensas" (default true)
- Checkbox "Esquema de Mesada" (default false) + campo R$ valor
- Validacao: ao menos um marcado
- Aviso quando recompensas off: "Tarefas com moedas, loja e historico ficam inacessiveis"
- Regra da mesada exibida: "O valor sera proporcional ao % de deveres individuais cumpridos no mes"
- Quando recompensas off: "As tarefas nao serao utilizadas para este filho. Serao usados deveres e compromissos."
- Persistir os 3 campos no insert/update e na funcao de replicar contrato
- Exibir na visualizacao do contrato (renderContrato)

---

## 3. Contrato de Autonomia — Crianca (`crianca/ContratoAutonomia.tsx`)

Exibir secao "Modelo de Incentivo" com esquemas ativos e valor da mesada.

---

## 4. Dashboard da Crianca (`CriancaDashboard.tsx`)

Quando `usar_recompensas = false`:
- Ocultar: NivelXP, Moedas, Loja, Meus Resgates, Conquistas

Quando `usar_mesada = true`:
- Card **"Minha Mesada"** com: % cumprimento (checkins cumprida=true no mes / regras ativas x dias ate hoje), valor previsto, valor atual, barra de progresso

---

## 5. Dashboard do Responsavel (`ResponsavelDashboard.tsx`)

- Novo card **"Mesada"** no grid do dashboard, visivel quando ao menos 1 filho tem `usar_mesada = true`
- Badge com icone de dinheiro, link para nova sub-pagina `/responsavel/mesada`

**Nova pagina `responsavel/MesadaFilhos.tsx`:**
- Seletor de filho (ou todos)
- Para cada filho com mesada ativa: card com nome, valor previsto, valor atual, % cumprimento geral do mes
- Detalhamento diario: lista/tabela dos dias do mes com % de deveres cumpridos naquele dia (checkins cumprida / regras ativas)
- Total acumulado do mes

---

## 6. Menu Lateral (`AppLayout.tsx`)

Quando `usar_recompensas = false` para crianca logada:
- Ocultar: Loja, Meus Resgates, Minhas Moedas, Conquistas

Quando `usar_mesada = true` para crianca:
- Adicionar link "Minha Mesada" (ou incluir no dashboard)

Para responsavel:
- Adicionar link "Mesada" no menu (condicional a ter filhos com mesada)

---

## 7. Telas de Configuracoes (`GerenciarTarefas.tsx`, `GerenciarRecompensas.tsx`)

Banner informativo listando filhos sem modelo de recompensas: "As tarefas e recompensas nao aparecem para: [nomes dos filhos]"

---

## 8. Calendarios (`AtribuirTarefas.tsx`, `MeusCompromissos.tsx`)

Quando `usar_recompensas = false` para o filho em questao:
- Ocultar completamente tarefas com `valor_moedas > 0`

---

## Arquivos impactados

| Arquivo | Mudanca |
|---|---|
| Migration SQL | Colunas + trigger update |
| `responsavel/ContratoAutonomia.tsx` | Secao modelo incentivo |
| `crianca/ContratoAutonomia.tsx` | Exibir modelo ativo |
| `CriancaDashboard.tsx` | Condicionar cards + card Mesada |
| `ResponsavelDashboard.tsx` | Card Mesada + rota |
| `responsavel/MesadaFilhos.tsx` (novo) | Tela detalhada mesada |
| `AppLayout.tsx` | Menu condicional |
| `GerenciarTarefas.tsx` | Banner informativo |
| `GerenciarRecompensas.tsx` | Banner informativo |
| `responsavel/AtribuirTarefas.tsx` | Filtrar tarefas |
| `crianca/MeusCompromissos.tsx` | Filtrar tarefas |

