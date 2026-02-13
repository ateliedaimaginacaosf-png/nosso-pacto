

# Autonomy Navigator — Plano de Implementação MVP

## Visão Geral
Aplicação web responsiva que transforma a gestão da autonomia infantil em uma jornada gamificada. Famílias criam um "Contrato de Autonomia" digital com tarefas, moedas e recompensas.

---

## FASE 1 — Autenticação e Estrutura Base

### 1.1 Configuração do Supabase
- Conectar o projeto ao Supabase (Lovable Cloud)
- Configurar autenticação por email/senha

### 1.2 Sistema de Autenticação
- **Página de Login** — formulário email/senha com opção de "Esqueci a senha"
- **Página de Registro do Responsável** — criar conta + criar família automaticamente
- **Criação de perfis de crianças** — o responsável cria perfis para os filhos (com email gerado ou email real)
- **Redirecionamento por perfil** — responsáveis vão para o painel de gestão, crianças para o painel de comando

### 1.3 Estrutura de Navegação
- Layout responsivo mobile-first com sidebar/menu
- Navegação separada para responsável e criança
- Proteção de rotas (só acessa se logado)

### 1.4 Banco de Dados Inicial
- Tabela `profiles` (nome, tipo_perfil, familia_id, foto_url)
- Tabela `familia` (nome)
- Tabela `configuracao_familia` (limite_resgate_diario, resgate_imediato)
- Tabela `user_roles` para controle de permissões
- Políticas RLS para isolar dados por família

---

## FASE 2 — Banco de Dados Completo

### 2.1 Tabelas de Tarefas
- Tabela `tarefa` com todos os campos (nome, descrição, categoria, valor_moedas, status, foto_comprovacao, justificativa)
- Ciclo de vida: A Fazer → Pendente de Aprovação → Concluída/Rejeitada → Arquivada

### 2.2 Tabelas de Recompensas
- Tabela `recompensa` (nome, descrição, custo_moedas, ativa)
- Tabela `resgate_recompensa` (status: pendente/aprovada/rejeitada/revertida)

### 2.3 Tabelas de Histórico
- Tabela `transacao` (tipo, quantidade_moedas, saldo_anterior, saldo_posterior)
- Tabela `notificacao` (tipo, titulo, mensagem, lida)

### 2.4 Segurança
- RLS em todas as tabelas (acesso isolado por família)
- Funções auxiliares para calcular saldo de moedas e verificar limite diário

---

## FASE 3 — Painel da Criança (Painel de Comando da Autonomia)

### 3.1 Dashboard Principal
- Saldo de moedas sempre visível (destaque visual, cores vibrantes)
- Lista de tarefas organizadas por status (A Fazer, Pendente, Concluída)
- Categorização visual das tarefas (ícones por categoria: Limpeza, Estudos, Exercício, Higiene)

### 3.2 Interação com Tarefas
- Marcar tarefa como concluída (com opção de anexar foto)
- Adicionar justificativa de não cumprimento
- Propor nova tarefa ao responsável

### 3.3 Loja de Recompensas
- Visualizar recompensas disponíveis com custo em moedas
- Resgatar recompensa (se saldo suficiente e dentro do limite diário)
- Histórico de resgates

### 3.4 Gamificação Visual
- Animações ao ganhar moedas e completar tarefas
- Cores vibrantes e feedback positivo
- Design lúdico e motivacional

---

## FASE 4 — Painel do Responsável

### 4.1 Dashboard de Gestão
- Visão geral de todos os filhos (saldo, tarefas pendentes)
- Notificações de ações pendentes (tarefas para aprovar, resgates para autorizar)

### 4.2 Gestão de Tarefas
- Criar tarefas personalizadas (nome, descrição, categoria, valor em moedas)
- Biblioteca de tarefas pré-definidas por categoria
- Atribuir tarefas a um ou múltiplos filhos
- Aprovar/rejeitar tarefas concluídas (com comentário)
- Arquivar tarefas

### 4.3 Gestão de Recompensas
- Criar e editar recompensas na loja
- Aprovar/rejeitar resgates (quando configurado)
- Reverter resgates já aprovados

### 4.4 Configurações da Família
- Definir limite diário de resgate de moedas
- Configurar se resgate é imediato ou com aprovação
- Registrar Regras de Ouro (texto informativo visível para toda família)
- Registrar Consequências Naturais
- Gerenciar membros da família (adicionar/remover filhos e responsáveis)

### 4.5 Relatórios e Histórico
- Relatórios por período (dia, semana, mês) e por criança
- Métricas: % tarefas concluídas, moedas ganhas vs gastas, tendências
- Histórico completo de transações
- Notificações in-app

