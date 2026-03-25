-- Enable RLS on all tables
-- Policy: only service_role and authenticated users with valid JWT can access
-- The anon key gets NO direct table access (all access goes through API routes)

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename NOT LIKE '_prisma%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Allow service_role full access (our API uses this)
    EXECUTE format('CREATE POLICY IF NOT EXISTS "service_role_all" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t);
  END LOOP;
END
$$;
