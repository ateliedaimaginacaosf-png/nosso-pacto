
-- Create interaction history table for redemptions (similar to tarefa_interacao)
CREATE TABLE public.resgate_interacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  resgate_id UUID NOT NULL REFERENCES public.resgate_recompensa(id) ON DELETE CASCADE,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  user_id UUID NOT NULL,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  mensagem TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.resgate_interacao ENABLE ROW LEVEL SECURITY;

-- Family members can view interactions
CREATE POLICY "Family members can view resgate interactions"
ON public.resgate_interacao
FOR SELECT
USING (is_family_member(auth.uid(), familia_id));

-- Family members can create interactions (own user_id)
CREATE POLICY "Family members can create resgate interactions"
ON public.resgate_interacao
FOR INSERT
WITH CHECK (is_family_member(auth.uid(), familia_id) AND auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_resgate_interacao_resgate_id ON public.resgate_interacao(resgate_id);
