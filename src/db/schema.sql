CREATE TABLE IF NOT EXISTS collection_runs (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  country CHAR(2) NOT NULL,
  currency CHAR(3) NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_summary TEXT
);

CREATE TABLE IF NOT EXISTS products (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  external_product_id TEXT NOT NULL,
  title TEXT,
  product_url TEXT,
  affiliate_url TEXT,
  main_image_url TEXT,
  shop_id TEXT,
  category_id TEXT,
  category_name TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tracking_status TEXT NOT NULL DEFAULT 'active',
  UNIQUE (source, external_product_id)
);

CREATE TABLE IF NOT EXISTS candidate_discoveries (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  discovery_method TEXT NOT NULL,
  discovery_context JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS candidate_discoveries_method_time_idx
  ON candidate_discoveries (discovery_method, discovered_at DESC);

CREATE TABLE IF NOT EXISTS price_observations (
  id BIGSERIAL PRIMARY KEY,
  product_id BIGINT NOT NULL REFERENCES products(id),
  collection_run_id BIGINT NOT NULL REFERENCES collection_runs(id),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  country CHAR(2) NOT NULL,
  currency CHAR(3) NOT NULL,
  price_scope TEXT NOT NULL,
  sale_price NUMERIC(18, 4),
  target_sale_price NUMERIC(18, 4),
  app_sale_price NUMERIC(18, 4),
  target_app_sale_price NUMERIC(18, 4),
  original_price NUMERIC(18, 4),
  target_original_price NUMERIC(18, 4),
  shipping_price NUMERIC(18, 4),
  coupon_amount NUMERIC(18, 4),
  new_user_price NUMERIC(18, 4),
  discount_percent NUMERIC(8, 4),
  availability TEXT,
  sku_id TEXT,
  sku_signature TEXT,
  parse_confidence NUMERIC(5, 4),
  raw_payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS price_observations_product_time_idx
  ON price_observations (product_id, observed_at DESC);

