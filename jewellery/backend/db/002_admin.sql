-- Owner / admin / employee app. Additive only: every existing row and column keeps working.

CREATE TABLE staff (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  mobile        text NOT NULL UNIQUE,
  role          text NOT NULL CHECK (role IN ('owner','admin','employee')),
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id         serial PRIMARY KEY,
  staff_id   int REFERENCES staff(id) ON DELETE SET NULL,
  action     text NOT NULL,
  entity     text NOT NULL,
  entity_id  text,
  details    jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_created_idx ON audit_log(created_at DESC);

-- ---------- settings ----------
ALTER TABLE store_settings
  ADD COLUMN brand_display_name         text NOT NULL DEFAULT '',
  ADD COLUMN description                text NOT NULL DEFAULT '',
  ADD COLUMN app_icon_url               text,
  ADD COLUMN splash_logo_url            text,
  ADD COLUMN contact_email              text NOT NULL DEFAULT '',
  ADD COLUMN address                    text NOT NULL DEFAULT '',
  ADD COLUMN city                       text NOT NULL DEFAULT '',
  ADD COLUMN state                      text NOT NULL DEFAULT '',
  ADD COLUMN pincode                    text NOT NULL DEFAULT '',
  ADD COLUMN opening_hours              text NOT NULL DEFAULT '',
  ADD COLUMN social_links               jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN payment_instructions       text NOT NULL DEFAULT '',
  ADD COLUMN payment_description        text NOT NULL DEFAULT '',
  ADD COLUMN upi_discount_enabled       boolean NOT NULL DEFAULT true,
  ADD COLUMN upi_discount_min_order_paise int NOT NULL DEFAULT 0 CHECK (upi_discount_min_order_paise >= 0),
  ADD COLUMN upi_discount_max_paise     int NOT NULL DEFAULT 0 CHECK (upi_discount_max_paise >= 0),  -- 0 = no cap
  ADD COLUMN upi_discount_starts_at     timestamptz,
  ADD COLUMN upi_discount_ends_at       timestamptz,
  ADD COLUMN min_order_paise            int NOT NULL DEFAULT 0 CHECK (min_order_paise >= 0),
  ADD COLUMN delivery_pincodes          text[] NOT NULL DEFAULT '{}',  -- empty = deliver everywhere
  ADD COLUMN delivery_areas_note        text NOT NULL DEFAULT '',
  ADD COLUMN replacement_policy         text NOT NULL DEFAULT '',
  ADD COLUMN low_stock_threshold        int NOT NULL DEFAULT 3 CHECK (low_stock_threshold >= 0),
  ADD COLUMN show_demo_products         boolean NOT NULL DEFAULT true;

-- ---------- products ----------
ALTER TABLE products
  ADD COLUMN is_demo     boolean NOT NULL DEFAULT false,
  ADD COLUMN archived_at timestamptz;
-- rows created by scripts/seed.js before this flag existed: generated SVG art + AJ- SKUs
UPDATE products SET is_demo = true
 WHERE sku LIKE 'AJ-%' AND cardinality(images) > 0
   AND images <@ ARRAY(SELECT '/uploads/products/' || slug || '-' || g || '.svg' FROM generate_series(0, 2) g);

CREATE TABLE inventory_movements (
  id          serial PRIMARY KEY,
  product_id  int REFERENCES products(id) ON DELETE SET NULL,
  sku         text NOT NULL,
  change      int NOT NULL,
  stock_after int NOT NULL,
  reason      text NOT NULL,
  order_id    int REFERENCES orders(id) ON DELETE SET NULL,
  staff_id    int REFERENCES staff(id) ON DELETE SET NULL,
  note        text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inventory_movements_product_idx ON inventory_movements(product_id, created_at DESC);

-- Every stock change is logged, whoever makes it. Writers describe the change with
-- set_config('app.stock_reason' / 'app.order_id' / 'app.staff_id' / 'app.stock_note', ..., true).
CREATE FUNCTION log_stock_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.stock IS DISTINCT FROM OLD.stock THEN
    INSERT INTO inventory_movements (product_id, sku, change, stock_after, reason, order_id, staff_id, note)
    VALUES (NEW.id, NEW.sku, NEW.stock - COALESCE(OLD.stock, 0), NEW.stock,
            COALESCE(nullif(current_setting('app.stock_reason', true), ''), CASE WHEN TG_OP = 'INSERT' THEN 'opening' ELSE 'adjustment' END),
            nullif(current_setting('app.order_id', true), '')::int,
            nullif(current_setting('app.staff_id', true), '')::int,
            COALESCE(current_setting('app.stock_note', true), ''));
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER products_stock_log AFTER INSERT OR UPDATE OF stock ON products FOR EACH ROW EXECUTE FUNCTION log_stock_change();
INSERT INTO inventory_movements (product_id, sku, change, stock_after, reason)
SELECT id, sku, stock, stock, 'opening' FROM products;

-- the cancel trigger restores stock; label those movements
CREATE OR REPLACE FUNCTION order_status_changed() RETURNS trigger AS $$
DECLARE
  t text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status AND NEW.customer_id IS NOT NULL
       AND NEW.payment_status IN ('verified','failed') THEN
      INSERT INTO notifications (customer_id, type, title, body, link) VALUES (
        NEW.customer_id, 'payment',
        CASE NEW.payment_status WHEN 'verified' THEN 'Payment verified' ELSE 'Payment could not be verified' END,
        'Order ' || NEW.order_number, '/orders/' || NEW.order_number);
    END IF;
    PERFORM pg_notify('order_update', json_build_object('order_id', NEW.id, 'customer_id', NEW.customer_id)::text);
    RETURN NEW;
  END IF;

  INSERT INTO order_status_history (order_id, status, staff_id)
  VALUES (NEW.id, NEW.status, nullif(current_setting('app.staff_id', true), '')::int);

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' THEN
    PERFORM set_config('app.stock_reason', 'cancel', true), set_config('app.order_id', NEW.id::text, true);
    UPDATE products p SET stock = p.stock + i.quantity, sold_count = greatest(p.sold_count - i.quantity, 0)
      FROM order_items i WHERE i.order_id = NEW.id AND i.product_id = p.id;
    PERFORM set_config('app.stock_reason', '', true), set_config('app.order_id', '', true);
  END IF;

  t := CASE NEW.status
    WHEN 'new' THEN 'Order placed'
    WHEN 'confirmed' THEN 'Order confirmed'
    WHEN 'preparing' THEN 'Your order is being prepared'
    WHEN 'ready_for_delivery' THEN 'Ready for delivery'
    WHEN 'out_for_delivery' THEN 'Out for delivery'
    WHEN 'delivered' THEN 'Delivered'
    WHEN 'cancelled' THEN 'Order cancelled'
  END;
  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO notifications (customer_id, type, title, body, link)
    VALUES (NEW.customer_id, 'order', t, 'Order ' || NEW.order_number, '/orders/' || NEW.order_number);
  END IF;
  PERFORM pg_notify('order_update', json_build_object('order_id', NEW.id, 'customer_id', NEW.customer_id)::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

ALTER TABLE order_status_history ADD COLUMN staff_id int REFERENCES staff(id) ON DELETE SET NULL;

-- ---------- orders: delivery + payment verification ----------
ALTER TABLE orders
  ADD COLUMN assigned_employee_id int REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN picked_up_at         timestamptz,
  ADD COLUMN delivered_by         int REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN cod_collected_paise  int CHECK (cod_collected_paise >= 0),
  ADD COLUMN cod_collected_at     timestamptz,
  ADD COLUMN cod_collected_by     int REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN bank_reference       text,
  ADD COLUMN payment_verified_by  int REFERENCES staff(id) ON DELETE SET NULL,
  ADD COLUMN payment_verified_at  timestamptz,
  ADD COLUMN payment_note         text NOT NULL DEFAULT '';
CREATE INDEX orders_assigned_idx ON orders(assigned_employee_id, status);
CREATE INDEX orders_created_idx ON orders(created_at DESC);

-- staff see new replacement requests live
CREATE FUNCTION replacement_created() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('order_update', json_build_object('order_id', NEW.order_id, 'customer_id', NEW.customer_id)::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER replacement_created AFTER INSERT ON replacement_requests FOR EACH ROW EXECUTE FUNCTION replacement_created();

-- ---------- promotions ----------
CREATE TABLE offers (
  id         serial PRIMARY KEY,
  kind       text NOT NULL DEFAULT 'special' CHECK (kind IN ('festival','new_collection','special')),
  title      text NOT NULL,
  subtitle   text NOT NULL DEFAULT '',
  cta        text NOT NULL DEFAULT '',
  link       text NOT NULL DEFAULT '',
  image_url  text,
  starts_at  timestamptz,
  ends_at    timestamptz,
  active     boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- existing home banners become offers so they stay editable
INSERT INTO offers (title, subtitle, cta, link, sort_order)
SELECT b->>'title', COALESCE(b->>'subtitle', ''), COALESCE(b->>'cta', ''), COALESCE(b->>'link', ''), ord
  FROM store_settings, jsonb_array_elements(banners) WITH ORDINALITY AS x(b, ord) WHERE b->>'title' IS NOT NULL;

CREATE FUNCTION offers_changed() RETURNS trigger AS $$
BEGIN PERFORM pg_notify('settings', ''); RETURN NULL; END $$ LANGUAGE plpgsql;
CREATE TRIGGER offers_changed AFTER INSERT OR UPDATE OR DELETE ON offers FOR EACH STATEMENT EXECUTE FUNCTION offers_changed();
CREATE TRIGGER categories_changed AFTER INSERT OR UPDATE OR DELETE ON categories FOR EACH STATEMENT EXECUTE FUNCTION offers_changed();

-- promotional messages only go to customers who opted in
ALTER TABLE customers ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false;
