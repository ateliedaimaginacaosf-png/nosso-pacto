-- Enable pg_net extension for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to send push notification via edge function
CREATE OR REPLACE FUNCTION public.notify_push_on_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  _supabase_url text;
  _anon_key text;
  _payload jsonb;
BEGIN
  _supabase_url := current_setting('app.settings.supabase_url', true);
  _anon_key := current_setting('app.settings.anon_key', true);

  -- Build payload
  _payload := jsonb_build_object(
    'user_id', NEW.user_id,
    'title', NEW.titulo,
    'body', COALESCE(NEW.mensagem, ''),
    'tag', NEW.tipo::text
  );

  -- Call edge function via pg_net
  PERFORM net.http_post(
    url := 'https://gqujksgkrwtamrcwdnqc.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdxdWprc2drcnd0YW1yY3dkbnFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEwMTAzNDUsImV4cCI6MjA4NjU4NjM0NX0.oqmViUX3rDZCC4pZyD63APKhfBFJ1aAjxdKSQxLCep8'
    ),
    body := _payload
  );

  RETURN NEW;
END;
$$;

-- Create trigger on notificacao table
CREATE TRIGGER trigger_push_on_notificacao_insert
  AFTER INSERT ON public.notificacao
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_push_on_insert();
