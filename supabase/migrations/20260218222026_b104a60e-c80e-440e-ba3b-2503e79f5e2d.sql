
CREATE OR REPLACE FUNCTION public.sync_contrato_to_config()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Only sync when status changes to 'vigente'
  IF NEW.status = 'vigente' AND (OLD.status IS NULL OR OLD.status <> 'vigente') AND NEW.crianca_id IS NOT NULL THEN
    UPDATE public.configuracao_familia
    SET
      regras_ouro = NEW.regras_ouro,
      direitos = NEW.direitos,
      consequencias_naturais = NEW.consequencias_naturais,
      limite_resgate_diario = NEW.limite_resgate_diario,
      resgate_imediato = NEW.resgate_imediato,
      updated_at = now()
    WHERE familia_id = NEW.familia_id
      AND crianca_id = NEW.crianca_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_contrato_vigente
  AFTER UPDATE ON public.contrato_versao
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_contrato_to_config();
