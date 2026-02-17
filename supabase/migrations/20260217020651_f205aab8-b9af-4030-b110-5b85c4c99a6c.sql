
-- Table to track daily golden rule check-ins per child per rule
CREATE TABLE public.regra_ouro_checkin (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  crianca_id UUID NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  regra TEXT NOT NULL,
  cumprida BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(familia_id, crianca_id, data, regra)
);

ALTER TABLE public.regra_ouro_checkin ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view checkins"
ON public.regra_ouro_checkin FOR SELECT
USING (is_family_member(auth.uid(), familia_id));

CREATE POLICY "Criancas can insert own checkins"
ON public.regra_ouro_checkin FOR INSERT
WITH CHECK (auth.uid() = crianca_id AND is_family_member(auth.uid(), familia_id));

CREATE POLICY "Criancas can update own checkins"
ON public.regra_ouro_checkin FOR UPDATE
USING (auth.uid() = crianca_id AND is_family_member(auth.uid(), familia_id));

-- Table for parent overrides when child is blocked
CREATE TABLE public.regra_ouro_liberacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  crianca_id UUID NOT NULL,
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  liberado_por UUID NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'total' CHECK (tipo IN ('total', 'limite_moedas')),
  limite_moedas INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(familia_id, crianca_id, data)
);

ALTER TABLE public.regra_ouro_liberacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Family members can view liberacoes"
ON public.regra_ouro_liberacao FOR SELECT
USING (is_family_member(auth.uid(), familia_id));

CREATE POLICY "Responsaveis can create liberacoes"
ON public.regra_ouro_liberacao FOR INSERT
WITH CHECK (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE POLICY "Responsaveis can update liberacoes"
ON public.regra_ouro_liberacao FOR UPDATE
USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

-- Trigger for updated_at on checkin
CREATE TRIGGER update_regra_ouro_checkin_updated_at
BEFORE UPDATE ON public.regra_ouro_checkin
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
