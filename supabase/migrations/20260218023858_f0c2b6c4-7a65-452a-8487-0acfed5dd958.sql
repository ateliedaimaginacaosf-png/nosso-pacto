-- Allow responsaveis to delete non-vigente contracts (rascunho, pendente, rejeitado)
CREATE POLICY "Responsaveis can delete non-vigente contracts"
ON public.contrato_versao
FOR DELETE
USING (
  is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'responsavel'::app_role)
  AND status NOT IN ('vigente', 'substituido')
);
