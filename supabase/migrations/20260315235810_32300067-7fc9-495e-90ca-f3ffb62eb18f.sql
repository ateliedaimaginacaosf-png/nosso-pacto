
-- Re-create the trigger to sync contrato_versao to configuracao_familia
DROP TRIGGER IF EXISTS trg_sync_contrato_to_config ON public.contrato_versao;
CREATE TRIGGER trg_sync_contrato_to_config
  AFTER UPDATE ON public.contrato_versao
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_contrato_to_config();
