
-- Add incentive model columns to contrato_versao
ALTER TABLE public.contrato_versao
  ADD COLUMN usar_recompensas boolean NOT NULL DEFAULT true,
  ADD COLUMN usar_mesada boolean NOT NULL DEFAULT false,
  ADD COLUMN valor_mesada numeric(10,2) DEFAULT NULL;

-- Add incentive model columns to configuracao_familia
ALTER TABLE public.configuracao_familia
  ADD COLUMN usar_recompensas boolean NOT NULL DEFAULT true,
  ADD COLUMN usar_mesada boolean NOT NULL DEFAULT false,
  ADD COLUMN valor_mesada numeric(10,2) DEFAULT NULL;

-- Update the sync trigger to include the new fields
CREATE OR REPLACE FUNCTION public.sync_contrato_to_config()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'vigente' AND (OLD.status IS NULL OR OLD.status <> 'vigente') AND NEW.crianca_id IS NOT NULL THEN
    UPDATE public.configuracao_familia
    SET
      regras_ouro = NEW.regras_ouro,
      direitos = NEW.direitos,
      consequencias_naturais = NEW.consequencias_naturais,
      limite_resgate_diario = NEW.limite_resgate_diario,
      resgate_imediato = NEW.resgate_imediato,
      usar_recompensas = NEW.usar_recompensas,
      usar_mesada = NEW.usar_mesada,
      valor_mesada = NEW.valor_mesada,
      updated_at = now()
    WHERE familia_id = NEW.familia_id
      AND crianca_id = NEW.crianca_id;
  END IF;
  RETURN NEW;
END;
$function$;
