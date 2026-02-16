
-- Add new values to status_resgate enum
ALTER TYPE public.status_resgate ADD VALUE IF NOT EXISTS 'cancelada';
ALTER TYPE public.status_resgate ADD VALUE IF NOT EXISTS 'cancelamento_solicitado';

-- Allow children to update their own redemptions (for cancellation)
CREATE POLICY "Criancas can update own redemptions"
ON public.resgate_recompensa
FOR UPDATE
USING (auth.uid() = crianca_id AND is_family_member(auth.uid(), familia_id));
