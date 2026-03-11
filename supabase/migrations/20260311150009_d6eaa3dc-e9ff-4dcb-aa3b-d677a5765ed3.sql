
-- Create enum for compromisso categories
CREATE TYPE public.categoria_compromisso AS ENUM ('prova', 'medico', 'esporte', 'pessoal', 'outro');

-- Create compromisso table
CREATE TABLE public.compromisso (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id UUID NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  crianca_id UUID NOT NULL,
  criado_por UUID NOT NULL,
  nome TEXT NOT NULL,
  descricao TEXT,
  categoria categoria_compromisso NOT NULL DEFAULT 'outro',
  data_hora TIMESTAMPTZ NOT NULL,
  concluido BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.compromisso ENABLE ROW LEVEL SECURITY;

-- Family members can view compromissos
CREATE POLICY "Family members can view compromissos"
  ON public.compromisso FOR SELECT
  TO authenticated
  USING (public.is_family_member(auth.uid(), familia_id));

-- Children can create their own compromissos
CREATE POLICY "Criancas can create own compromissos"
  ON public.compromisso FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = crianca_id
    AND auth.uid() = criado_por
    AND public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'crianca')
  );

-- Responsaveis can create compromissos for family children
CREATE POLICY "Responsaveis can create compromissos"
  ON public.compromisso FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel')
    AND auth.uid() = criado_por
  );

-- Children can update their own compromissos
CREATE POLICY "Criancas can update own compromissos"
  ON public.compromisso FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = crianca_id
    AND public.is_family_member(auth.uid(), familia_id)
  );

-- Responsaveis can update family compromissos
CREATE POLICY "Responsaveis can update compromissos"
  ON public.compromisso FOR UPDATE
  TO authenticated
  USING (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel')
  );

-- Children can delete their own compromissos
CREATE POLICY "Criancas can delete own compromissos"
  ON public.compromisso FOR DELETE
  TO authenticated
  USING (
    auth.uid() = crianca_id
    AND public.is_family_member(auth.uid(), familia_id)
  );

-- Responsaveis can delete family compromissos
CREATE POLICY "Responsaveis can delete compromissos"
  ON public.compromisso FOR DELETE
  TO authenticated
  USING (
    public.is_family_member(auth.uid(), familia_id)
    AND public.has_role(auth.uid(), 'responsavel')
  );

-- Updated at trigger
CREATE TRIGGER update_compromisso_updated_at
  BEFORE UPDATE ON public.compromisso
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.compromisso;
