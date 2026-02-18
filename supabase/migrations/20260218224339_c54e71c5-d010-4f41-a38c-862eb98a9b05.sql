CREATE POLICY "Responsaveis can update family profiles"
ON public.profiles
FOR UPDATE
USING (
  is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'responsavel'::app_role)
);