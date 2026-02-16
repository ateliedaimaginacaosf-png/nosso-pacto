
-- Add flag to identify extra tasks created by children
ALTER TABLE public.tarefa ADD COLUMN tarefa_extra boolean NOT NULL DEFAULT false;

-- Allow children to insert their own tasks (extras only)
CREATE POLICY "Criancas can create extra tasks"
ON public.tarefa FOR INSERT
WITH CHECK (
  auth.uid() = atribuida_a
  AND is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'crianca'::app_role)
  AND tarefa_extra = true
);
