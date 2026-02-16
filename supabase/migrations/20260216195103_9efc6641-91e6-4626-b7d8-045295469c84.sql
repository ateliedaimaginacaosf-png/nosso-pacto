
-- Table for task interaction history (every status change)
CREATE TABLE public.tarefa_interacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tarefa_id UUID NOT NULL REFERENCES public.tarefa(id) ON DELETE CASCADE,
  familia_id UUID NOT NULL REFERENCES public.familia(id),
  user_id UUID NOT NULL,
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  mensagem TEXT,
  foto_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tarefa_interacao ENABLE ROW LEVEL SECURITY;

-- Family members can view interactions
CREATE POLICY "Family members can view interactions"
  ON public.tarefa_interacao FOR SELECT
  USING (is_family_member(auth.uid(), familia_id));

-- Family members can create interactions (both child and parent)
CREATE POLICY "Family members can create interactions"
  ON public.tarefa_interacao FOR INSERT
  WITH CHECK (is_family_member(auth.uid(), familia_id) AND auth.uid() = user_id);

-- Index for fast lookup by task
CREATE INDEX idx_tarefa_interacao_tarefa_id ON public.tarefa_interacao(tarefa_id);
CREATE INDEX idx_tarefa_interacao_familia_id ON public.tarefa_interacao(familia_id);

-- Storage bucket for task photos
INSERT INTO storage.buckets (id, name, public) VALUES ('tarefa-fotos', 'tarefa-fotos', true);

-- Storage policies
CREATE POLICY "Family members can upload task photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'tarefa-fotos' AND auth.role() = 'authenticated');

CREATE POLICY "Anyone can view task photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'tarefa-fotos');

CREATE POLICY "Users can delete own task photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'tarefa-fotos' AND auth.uid()::text = (storage.foldername(name))[1]);
