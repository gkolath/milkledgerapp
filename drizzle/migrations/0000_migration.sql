CREATE TABLE public.households (
  user_id uuid PRIMARY KEY,
  seller_name text CHECK (seller_name IS NULL OR char_length(seller_name) <= 60),
  upi_id text CHECK (upi_id IS NULL OR upi_id ~ '^[A-Za-z0-9._-]{2,256}@[A-Za-z][A-Za-z0-9.-]{1,63}$'),
  rate_one integer NOT NULL DEFAULT 70 CHECK (rate_one BETWEEN 1 AND 10000),
  rate_half integer NOT NULL DEFAULT 35 CHECK (rate_half BETWEEN 1 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.deliveries (
  user_id uuid NOT NULL,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('one','half')),
  status text NOT NULL CHECK (status IN ('y','n')),
  rate integer CHECK (rate IS NULL OR rate BETWEEN 1 AND 10000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day, kind)
);
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month date NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  method text NOT NULL CHECK (method IN ('upi','cash','other')),
  note text,
  paid_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_user_month ON public.payments(user_id, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.households, public.deliveries, public.payments TO authenticated;
GRANT ALL ON public.households, public.deliveries, public.payments TO service_role;

ALTER TABLE public.households ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own household" ON public.households FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own deliveries" ON public.deliveries FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "own payments" ON public.payments FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  DELETE FROM public.deliveries WHERE user_id = uid;
  DELETE FROM public.payments WHERE user_id = uid;
  DELETE FROM public.households WHERE user_id = uid;
  DELETE FROM auth.users WHERE id = uid;
END $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;