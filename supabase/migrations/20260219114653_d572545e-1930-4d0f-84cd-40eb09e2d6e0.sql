-- Trigger: push imediato quando badge é desbloqueado (raro e celebratório)
CREATE OR REPLACE FUNCTION public.notify_push_badge_unlock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _badge_nome text;
  _badge_emoji text;
  _crianca_nome text;
BEGIN
  SELECT nome, emoji INTO _badge_nome, _badge_emoji FROM public.badge WHERE id = NEW.badge_id;
  SELECT nome INTO _crianca_nome FROM public.profiles WHERE user_id = NEW.user_id;

  -- Send push to the child who unlocked the badge
  PERFORM net.http_post(
    url := 'https://gqujksgkrwtamrcwdnqc.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWprc2drcnd0YW1yY3dkbnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTAzNDUsImV4cCI6MjA4NjU4NjM0NX0.oqmViUX3rDZCC4pZyD63APKhfBFJ1aAjxdKSQxLCep8'
    ),
    body := jsonb_build_object(
      'user_id', NEW.user_id,
      'title', _badge_emoji || ' Conquista desbloqueada!',
      'body', 'Parabéns! Você ganhou a medalha "' || _badge_nome || '"! 🎉',
      'url', '/crianca/conquistas',
      'tag', 'badge'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_push_badge_unlock
  AFTER INSERT ON public.badge_desbloqueio
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_badge_unlock();

-- Trigger: push imediato quando novo contrato aguarda aprovação da criança (raro)
CREATE OR REPLACE FUNCTION public.notify_push_new_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  -- Only notify when status changes to pendente_aprovacao and has a crianca_id
  IF NEW.status = 'pendente_aprovacao' AND (OLD.status IS NULL OR OLD.status <> 'pendente_aprovacao') AND NEW.crianca_id IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://gqujksgkrwtamrcwdnqc.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWprc2drcnd0YW1yY3dkbnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTAzNDUsImV4cCI6MjA4NjU4NjM0NX0.oqmViUX3rDZCC4pZyD63APKhfBFJ1aAjxdKSQxLCep8'
      ),
      body := jsonb_build_object(
        'user_id', NEW.crianca_id,
        'title', '📝 Novo contrato para aprovar',
        'body', 'Tem um novo Contrato de Autonomia esperando sua aprovação!',
        'url', '/crianca/contrato',
        'tag', 'contract'
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_push_new_contract
  AFTER UPDATE ON public.contrato_versao
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_new_contract();