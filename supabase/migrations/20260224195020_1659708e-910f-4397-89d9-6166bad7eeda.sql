
INSERT INTO storage.buckets (id, name, public) VALUES ('flow-images', 'flow-images', true);

CREATE POLICY "Public read access for flow-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'flow-images');

CREATE POLICY "Admin insert flow-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'flow-images');

CREATE POLICY "Admin update flow-images"
ON storage.objects FOR UPDATE
USING (bucket_id = 'flow-images');

CREATE POLICY "Admin delete flow-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'flow-images');
