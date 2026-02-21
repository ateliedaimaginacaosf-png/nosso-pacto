
## Ajustes nas Telas de Modelos de Tarefas e Recompensas

### Mudancas planejadas

**1. Voltar a exibir a descricao nas duas telas**
- Abaixo do nome (primeira linha com emoji + nome truncado), adicionar uma segunda linha com a descricao em texto menor, cor mais clara e italico
- A descricao tambem sera truncada em 1 linha com reticencias

**2. Reorganizar informacoes na segunda/terceira linha**
- Tarefas: Linha 1 = emoji + nome | Linha 2 = descricao (italico, muted) | Linha 3 = categoria + moedas + badges
- Recompensas: Linha 1 = emoji + nome | Linha 2 = descricao (italico, muted) | Linha 3 = moedas + Auto + badges

**3. Botoes alinhados a esquerda no mobile**
- Os botoes de acao (switch, editar, excluir) continuam abaixo, alinhados a esquerda no celular
- No desktop (md+), manter layout horizontal com botoes a direita

**4. Filtro de ativos/inativos com botoes clicaveis (toggle buttons)**
- Substituir o combobox (Select) por um grupo de botoes segmentados (tipo toggle/tabs)
- Opcoes: "Todos" | "Ativas" | "Inativas"
- Visual mais limpo e rapido de usar no celular
- Aplicar nas duas telas (Tarefas e Recompensas)

### Detalhes tecnicos

**Arquivos a editar:**

1. `src/pages/responsavel/GerenciarTarefas.tsx`
   - Adicionar `<p>` com `t.descricao` abaixo do nome, com classes `text-xs text-muted-foreground italic truncate`
   - Substituir o `Select` de filtroAtivo por um grupo de `Button` com variantes `outline`/`default` conforme selecionado
   - Adicionar classes responsivas: `flex-col md:flex-row md:items-center md:justify-between` no container do card
   - Botoes de acao: `md:ml-auto` para alinhar a direita no desktop

2. `src/pages/responsavel/GerenciarRecompensas.tsx`
   - Mesma logica: adicionar descricao em italico abaixo do nome
   - Substituir Select por toggle buttons
   - Layout responsivo identico ao de tarefas
