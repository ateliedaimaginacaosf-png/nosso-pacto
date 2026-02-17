
-- Add column to store deactivated golden rules (soft delete)
ALTER TABLE public.configuracao_familia
ADD COLUMN regras_ouro_inativas text[] NOT NULL DEFAULT '{}'::text[];
