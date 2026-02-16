-- Allow children to insert their own redemption transactions
CREATE POLICY "Criancas can create own redemption transactions"
ON public.transacao
FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND is_family_member(auth.uid(), familia_id)
  AND has_role(auth.uid(), 'crianca'::app_role)
  AND tipo = 'resgate_recompensa'::tipo_transacao
);