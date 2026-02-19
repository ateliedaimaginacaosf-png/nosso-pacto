
-- Add active flag to familia
ALTER TABLE public.familia ADD COLUMN ativo boolean NOT NULL DEFAULT false;

-- Create subscription/payment tracking table
CREATE TABLE public.assinatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  familia_id uuid NOT NULL REFERENCES public.familia(id) ON DELETE CASCADE,
  plataforma text NOT NULL, -- 'hotmart', 'kiwify', 'manual', etc.
  plataforma_transaction_id text, -- ID da transação na plataforma
  email_comprador text NOT NULL,
  status text NOT NULL DEFAULT 'ativa', -- ativa, cancelada, reembolsada
  data_ativacao timestamp with time zone NOT NULL DEFAULT now(),
  data_expiracao timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.assinatura ENABLE ROW LEVEL SECURITY;

-- Only the webhook (service_role) inserts/updates subscriptions
-- Family members can view their own subscription
CREATE POLICY "Family members can view own subscription"
ON public.assinatura FOR SELECT
USING (is_family_member(auth.uid(), familia_id));

-- Trigger for updated_at
CREATE TRIGGER update_assinatura_updated_at
BEFORE UPDATE ON public.assinatura
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Activate all existing families so current users aren't locked out
UPDATE public.familia SET ativo = true;
