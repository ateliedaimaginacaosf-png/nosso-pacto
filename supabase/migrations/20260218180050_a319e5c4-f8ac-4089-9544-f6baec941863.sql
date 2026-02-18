
-- Add direitos array to contrato_versao
ALTER TABLE public.contrato_versao 
ADD COLUMN direitos text[] NOT NULL DEFAULT '{}'::text[];

-- Add direitos array to configuracao_familia
ALTER TABLE public.configuracao_familia 
ADD COLUMN direitos text[] NOT NULL DEFAULT '{}'::text[];
