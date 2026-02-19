-- Add unique constraint on endpoint for upsert support
ALTER TABLE public.push_subscription ADD CONSTRAINT push_subscription_endpoint_key UNIQUE (endpoint);
