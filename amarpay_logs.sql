CREATE TABLE IF NOT EXISTS public.amarpay_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    tran_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    payload JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Give anon and authenticated roles insert access if needed (depending on how Edge functions are called)
-- though Edge functions with SERVICE_ROLE key will bypass RLS.
GRANT INSERT ON public.amarpay_logs TO anon;
GRANT INSERT ON public.amarpay_logs TO authenticated;
