
-- Drop the restrictive UPDATE policies
DROP POLICY IF EXISTS "Criancas can approve contracts" ON public.contrato_versao;
DROP POLICY IF EXISTS "Responsaveis can update contracts" ON public.contrato_versao;

-- Recreate as PERMISSIVE so either one passing is enough
CREATE POLICY "Criancas can approve contracts"
ON public.contrato_versao
FOR UPDATE
USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'crianca'::app_role));

CREATE POLICY "Responsaveis can update contracts"
ON public.contrato_versao
FOR UPDATE
USING (is_family_member(auth.uid(), familia_id) AND has_role(auth.uid(), 'responsavel'::app_role));
