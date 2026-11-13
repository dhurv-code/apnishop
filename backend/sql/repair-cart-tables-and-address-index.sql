-- Run in pgAdmin Query Tool against apnabasket_dev AFTER db:migrate.
-- Safe to repeat. If migration 0004 already dropped cart records, this recreates
-- empty tables; deleted rows require a database backup to recover.

CREATE TABLE IF NOT EXISTS public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carts_user_id_unique UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL,
  product_id uuid NOT NULL,
  quantity numeric(10,3) NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='carts_user_id_users_id_fk' AND conrelid='public.carts'::regclass) THEN
    ALTER TABLE public.carts ADD CONSTRAINT carts_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cart_items_cart_id_carts_id_fk' AND conrelid='public.cart_items'::regclass) THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_cart_id_carts_id_fk FOREIGN KEY (cart_id) REFERENCES public.carts(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cart_items_product_id_products_id_fk' AND conrelid='public.cart_items'::regclass) THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_product_id_products_id_fk FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cart_items_quantity_positive' AND conrelid='public.cart_items'::regclass) THEN
    ALTER TABLE public.cart_items ADD CONSTRAINT cart_items_quantity_positive CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='carts_user_id_unique' AND conrelid='public.carts'::regclass) THEN
    ALTER TABLE public.carts ADD CONSTRAINT carts_user_id_unique UNIQUE (user_id);
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_cart_product_unique ON public.cart_items (cart_id, product_id);
CREATE INDEX IF NOT EXISTS cart_items_cart_id_idx ON public.cart_items (cart_id);
CREATE INDEX IF NOT EXISTS cart_items_product_id_idx ON public.cart_items (product_id);
CREATE INDEX IF NOT EXISTS carts_user_id_idx ON public.carts (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS addresses_one_default_per_user ON public.addresses (user_id) WHERE is_default = true;
