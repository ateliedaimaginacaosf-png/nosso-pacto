
-- Allow responsaveis to insert checkins for children in their family
CREATE POLICY "Responsaveis can insert checkins"
ON public.regra_ouro_checkin
FOR INSERT
WITH CHECK (
  is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'responsavel'::app_role)
);

-- Allow responsaveis to update checkins for children in their family
CREATE POLICY "Responsaveis can update checkins"
ON public.regra_ouro_checkin
FOR UPDATE
USING (
  is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'responsavel'::app_role)
);
