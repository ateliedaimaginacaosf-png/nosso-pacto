
-- =============================================
-- FASE 2: Schema completo
-- =============================================

-- Enum para categorias de tarefa
CREATE TYPE public.categoria_tarefa AS ENUM (
  'limpeza', 'estudos', 'exercicio', 'higiene', 'alimentacao', 'organizacao', 'outros'
);

-- Enum para status de tarefa
CREATE TYPE public.status_tarefa AS ENUM (
  'a_fazer', 'pendente_aprovacao', 'concluida', 'rejeitada', 'arquivada'
);

-- Enum para status de resgate
CREATE TYPE public.status_resgate AS ENUM (
  'pendente', 'aprovada', 'rejeitada', 'revertida'
);

-- Enum para tipo de transação
CREATE TYPE public.tipo_transacao AS ENUM (
  'ganho_tarefa', 'resgate_recompensa', 'bonus', 'penalidade', 'reversao'
);

-- Enum para tipo de notificação
CREATE TYPE public.tipo_notificacao AS ENUM (
  'tarefa_concluida', 'tarefa_aprovada', 'tarefa_rejeitada',
  'resgate_solicitado', 'resgate_aprovado', 'resgate_rejeitado', 'resgate_revertido',
  'nova_tarefa', 'bonus_recebido', 'penalidade_recebida'
);

-- =============================================
-- TABELA: tarefa
-- =============================================
CREATE TABLE public.tarefa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  criada_por UUID NOT NULL REFERENCES auth.users(id),
  atribuida_a UUID REFERENCES auth.users(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria categoria_tarefa NOT NULL DEFAULT 'outros',
  valor_moedas INTEGER NOT NULL DEFAULT 1 CHECK (valor_moedas >= 0),
  status status_tarefa NOT NULL DEFAULT 'a_fazer',
  foto_comprovacao TEXT,
  justificativa TEXT,
  comentario_responsavel TEXT,
  data_conclusao TIMESTAMPTZ,
  data_aprovacao TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tarefa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view tasks"
  ON public.tarefa FOR SELECT
  USING (public.is_family_member(auth.uid(), familia_id));

CREATE POLICY "Responsaveis can create tasks"
  ON public.tarefa FOR INSERT
  WITH CHECK (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

CREATE POLICY "Responsaveis can update tasks"
  ON public.tarefa FOR UPDATE
  USING (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

-- Crianças podem atualizar apenas suas próprias tarefas (marcar como concluída)
CREATE POLICY "Criancas can update own tasks"
  ON public.tarefa FOR UPDATE
  USING (
    auth.uid() = atribuida_a
    AND public.is_family_member(auth.uid(), familia_id)
  );

CREATE POLICY "Responsaveis can delete tasks"
  ON public.tarefa FOR DELETE
  USING (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

CREATE TRIGGER update_tarefa_updated_at
  BEFORE UPDATE ON public.tarefa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TABELA: recompensa
-- =============================================
CREATE TABLE public.recompensa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  custo_moedas INTEGER NOT NULL DEFAULT 1 CHECK (custo_moedas >= 0),
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recompensa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view rewards"
  ON public.recompensa FOR SELECT
  USING (public.is_family_member(auth.uid(), familia_id));

CREATE POLICY "Responsaveis can manage rewards"
  ON public.recompensa FOR INSERT
  WITH CHECK (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

CREATE POLICY "Responsaveis can update rewards"
  ON public.recompensa FOR UPDATE
  USING (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

CREATE POLICY "Responsaveis can delete rewards"
  ON public.recompensa FOR DELETE
  USING (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

CREATE TRIGGER update_recompensa_updated_at
  BEFORE UPDATE ON public.recompensa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TABELA: resgate_recompensa
-- =============================================
CREATE TABLE public.resgate_recompensa (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  recompensa_id UUID NOT NULL REFERENCES public.recompensa(id) ON DELETE CASCADE,
  crianca_id UUID NOT NULL REFERENCES auth.users(id),
  aprovado_por UUID REFERENCES auth.users(id),
  custo_moedas INTEGER NOT NULL,
  status status_resgate NOT NULL DEFAULT 'pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.resgate_recompensa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view redemptions"
  ON public.resgate_recompensa FOR SELECT
  USING (public.is_family_member(auth.uid(), familia_id));

CREATE POLICY "Criancas can request redemptions"
  ON public.resgate_recompensa FOR INSERT
  WITH CHECK (
    auth.uid() = crianca_id
    AND public.is_family_member(auth.uid(), familia_id)
  );

CREATE POLICY "Responsaveis can update redemptions"
  ON public.resgate_recompensa FOR UPDATE
  USING (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

CREATE TRIGGER update_resgate_updated_at
  BEFORE UPDATE ON public.resgate_recompensa
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- TABELA: transacao
-- =============================================
CREATE TABLE public.transacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  tipo tipo_transacao NOT NULL,
  quantidade_moedas INTEGER NOT NULL,
  saldo_anterior INTEGER NOT NULL DEFAULT 0,
  saldo_posterior INTEGER NOT NULL DEFAULT 0,
  referencia_id UUID,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view transactions"
  ON public.transacao FOR SELECT
  USING (public.is_family_member(auth.uid(), familia_id));

-- Transações são criadas apenas pelo sistema (via funções), não diretamente pelo cliente
-- Mas permitimos insert para responsáveis (bonus/penalidade)
CREATE POLICY "Responsaveis can create transactions"
  ON public.transacao FOR INSERT
  WITH CHECK (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

-- =============================================
-- TABELA: notificacao
-- =============================================
CREATE TABLE public.notificacao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  tipo tipo_notificacao NOT NULL,
  titulo TEXT NOT NULL,
  mensagem TEXT,
  lida BOOLEAN NOT NULL DEFAULT false,
  referencia_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notificacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notificacao FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notificacao FOR UPDATE
  USING (auth.uid() = user_id);

-- Sistema pode criar notificações (via responsável)
CREATE POLICY "Responsaveis can create notifications"
  ON public.notificacao FOR INSERT
  WITH CHECK (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel'::app_role)
  );

-- =============================================
-- FUNÇÕES AUXILIARES
-- =============================================

-- Função para calcular saldo de moedas de um usuário
CREATE OR REPLACE FUNCTION public.calcular_saldo(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT saldo_posterior FROM public.transacao 
     WHERE user_id = _user_id 
     ORDER BY created_at DESC LIMIT 1),
    0
  );
$$;

-- Função para verificar limite diário de resgate
CREATE OR REPLACE FUNCTION public.verificar_limite_diario(_user_id UUID, _familia_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT SUM(custo_moedas) FROM public.resgate_recompensa
     WHERE crianca_id = _user_id
       AND familia_id = _familia_id
       AND status IN ('pendente', 'aprovada')
       AND created_at::date = CURRENT_DATE),
    0
  )::INTEGER;
$$;

-- Adicionar coluna saldo_moedas na profiles para cache rápido
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS saldo_moedas INTEGER NOT NULL DEFAULT 0;

-- Índices para performance
CREATE INDEX idx_tarefa_familia ON public.tarefa(familia_id);
CREATE INDEX idx_tarefa_atribuida ON public.tarefa(atribuida_a);
CREATE INDEX idx_tarefa_status ON public.tarefa(status);
CREATE INDEX idx_recompensa_familia ON public.recompensa(familia_id);
CREATE INDEX idx_resgate_familia ON public.resgate_recompensa(familia_id);
CREATE INDEX idx_resgate_crianca ON public.resgate_recompensa(crianca_id);
CREATE INDEX idx_transacao_user ON public.transacao(user_id);
CREATE INDEX idx_transacao_familia ON public.transacao(familia_id);
CREATE INDEX idx_notificacao_user ON public.notificacao(user_id);
CREATE INDEX idx_notificacao_lida ON public.notificacao(user_id, lida);
