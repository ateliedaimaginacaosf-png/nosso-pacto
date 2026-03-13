CREATE POLICY "Criancas can delete own extra tasks"
ON public.tarefa
FOR DELETE
TO public
USING (
  auth.uid() = atribuida_a
  AND is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'crianca'::app_role)
  AND tarefa_extra = true
);