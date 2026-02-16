
-- =============================================
-- 1. Create tarefa_padrao (Task Template)
-- =============================================
CREATE TABLE public.tarefa_padrao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria public.categoria_tarefa NOT NULL DEFAULT 'outros',
  valor_moedas INTEGER NOT NULL DEFAULT 1,
  criada_por UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tarefa_padrao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view task templates"
  ON public.tarefa_padrao FOR SELECT
  USING (is_family_member(auth.uid(), familia_id));

CREATE POLICY "Responsaveis can create task templates"
  ON public.tarefa_padrao FOR INSERT
  WITH CHECK (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE POLICY "Responsaveis can update task templates"
  ON public.tarefa_padrao FOR UPDATE
  USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE POLICY "Responsaveis can delete task templates"
  ON public.tarefa_padrao FOR DELETE
  USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE TRIGGER update_tarefa_padrao_updated_at
  BEFORE UPDATE ON public.tarefa_padrao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 2. Create tarefa_recorrente (Recurrence Rule)
-- =============================================
CREATE TABLE public.tarefa_recorrente (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  tarefa_padrao_id UUID NOT NULL REFERENCES public.tarefa_padrao(id) ON DELETE CASCADE,
  atribuida_a UUID NOT NULL,
  periodicidade public.periodicidade_tarefa NOT NULL DEFAULT 'diaria',
  dias_semana INTEGER[] DEFAULT '{}',
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE,
  data_fim DATE,
  ativa BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tarefa_recorrente ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view recurrence rules"
  ON public.tarefa_recorrente FOR SELECT
  USING (is_family_member(auth.uid(), familia_id));

CREATE POLICY "Responsaveis can create recurrence rules"
  ON public.tarefa_recorrente FOR INSERT
  WITH CHECK (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE POLICY "Responsaveis can update recurrence rules"
  ON public.tarefa_recorrente FOR UPDATE
  USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE POLICY "Responsaveis can delete recurrence rules"
  ON public.tarefa_recorrente FOR DELETE
  USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE TRIGGER update_tarefa_recorrente_updated_at
  BEFORE UPDATE ON public.tarefa_recorrente
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- 3. Extend tarefa table for instances
-- =============================================
ALTER TABLE public.tarefa
  ADD COLUMN IF NOT EXISTS tarefa_recorrente_id UUID REFERENCES public.tarefa_recorrente(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_prevista DATE;

CREATE INDEX IF NOT EXISTS idx_tarefa_data_prevista ON public.tarefa(data_prevista);
CREATE INDEX IF NOT EXISTS idx_tarefa_recorrente_id ON public.tarefa(tarefa_recorrente_id);
CREATE INDEX IF NOT EXISTS idx_tarefa_recorrente_ativa ON public.tarefa_recorrente(ativa, familia_id);
