-- Disable the trigger (keeps it for future re-activation)
ALTER TABLE public.notificacao DISABLE TRIGGER trigger_push_on_notificacao_insert;