
-- Enum para status do contrato
CREATE TYPE public.status_contrato AS ENUM ('rascunho', 'pendente_aprovacao', 'vigente', 'substituido', 'rejeitado');

-- Enum para status da revisão
CREATE TYPE public.status_revisao AS ENUM ('pendente', 'aceita', 'recusada');

-- Tabela de versões do contrato de autonomia
CREATE TABLE public.contrato_versao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  versao INTEGER NOT NULL DEFAULT 1,
  status status_contrato NOT NULL DEFAULT 'rascunho',
  
  -- Conteúdo do contrato
  regras_ouro TEXT[] NOT NULL DEFAULT '{}',
  consequencias_naturais TEXT[] NOT NULL DEFAULT '{}',
  limite_resgate_diario INTEGER NOT NULL DEFAULT 50,
  resgate_imediato BOOLEAN NOT NULL DEFAULT true,
  
  -- Metadados de alteração
  descricao_alteracoes TEXT,
  criado_por UUID NOT NULL,
  aprovado_por UUID,
  data_aprovacao TIMESTAMP WITH TIME ZONE,
  data_vigencia TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela de solicitações de revisão (criança → responsável)
CREATE TABLE public.contrato_revisao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  contrato_versao_id UUID NOT NULL REFERENCES public.contrato_versao(id),
  solicitante_id UUID NOT NULL,
  justificativa TEXT NOT NULL,
  status status_revisao NOT NULL DEFAULT 'pendente',
  resposta TEXT,
  respondido_por UUID,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.contrato_versao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contrato_revisao ENABLE ROW LEVEL SECURITY;

-- Policies contrato_versao
CREATE POLICY "Family members can view contracts"
  ON public.contrato_versao FOR SELECT
  USING (is_family_member(auth.uid(), familia_id));

CREATE POLICY "Responsaveis can create contracts"
  ON public.contrato_versao FOR INSERT
  WITH CHECK (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

CREATE POLICY "Responsaveis can update contracts"
  ON public.contrato_versao FOR UPDATE
  USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

-- Criança pode atualizar status (aprovar/rejeitar pendente)
CREATE POLICY "Criancas can approve contracts"
  ON public.contrato_versao FOR UPDATE
  USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'crianca'::app_role));

-- Policies contrato_revisao
CREATE POLICY "Family members can view revisions"
  ON public.contrato_revisao FOR SELECT
  USING (is_family_member(auth.uid(), familia_id));

CREATE POLICY "Criancas can request revisions"
  ON public.contrato_revisao FOR INSERT
  WITH CHECK (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'crianca'::app_role) AND auth.uid() = solicitante_id);

CREATE POLICY "Responsaveis can respond to revisions"
  ON public.contrato_revisao FOR UPDATE
  USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));

-- Triggers updated_at
CREATE TRIGGER update_contrato_versao_updated_at
  BEFORE UPDATE ON public.contrato_versao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contrato_revisao_updated_at
  BEFORE UPDATE ON public.contrato_revisao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
