-- Shared schema for the customer app and the admin/employee app.
-- Business rules that must hold no matter which app writes (status history,
-- notifications, stock restore on cancel) live in triggers, not in app code.

CREATE TABLE store_settings (
  id                       int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shop_name                text NOT NULL DEFAULT 'Jewellery Shop',
  tagline                  text NOT NULL DEFAULT '',
  logo_url                 text,
  upi_id                   text NOT NULL DEFAULT '',
  upi_payee_name           text NOT NULL DEFAULT '',
  upi_enabled              boolean NOT NULL DEFAULT true,
  cod_enabled              boolean NOT NULL DEFAULT true,
  upi_discount_percent     numeric(5,2) NOT NULL DEFAULT 3 CHECK (upi_discount_percent BETWEEN 0 AND 100),
  delivery_charge_paise    int NOT NULL DEFAULT 0 CHECK (delivery_charge_paise >= 0),
  free_delivery_min_paise  int NOT NULL DEFAULT 0 CHECK (free_delivery_min_paise >= 0),
  whatsapp_number          text NOT NULL DEFAULT '',
  support_phone            text NOT NULL DEFAULT '',
  replacement_window_hours int NOT NULL DEFAULT 3 CHECK (replacement_window_hours >= 0),
  cancellable_statuses     text[] NOT NULL DEFAULT '{new,confirmed}',
  banners                  jsonb NOT NULL DEFAULT '[]',
  updated_at               timestamptz NOT NULL DEFAULT now()
);
INSERT INTO store_settings (id) VALUES (1);

CREATE TABLE categories (
  id         serial PRIMARY KEY,
  slug       text NOT NULL UNIQUE,
  name       text NOT NULL,
  image_url  text,
  sort_order int NOT NULL DEFAULT 0,
  active     boolean NOT NULL DEFAULT true
);

CREATE TABLE products (
  id                  serial PRIMARY KEY,
  sku                 text NOT NULL UNIQUE,
  slug                text NOT NULL UNIQUE,
  name                text NOT NULL,
  category_id         int REFERENCES categories(id) ON DELETE SET NULL,
  description         text NOT NULL DEFAULT '',
  original_price_paise int NOT NULL CHECK (original_price_paise >= 0),
  selling_price_paise  int NOT NULL CHECK (selling_price_paise >= 0),
  stock               int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  images              text[] NOT NULL DEFAULT '{}',
  video_url           text,
  specifications      jsonb NOT NULL DEFAULT '{}',
  -- merchandising flags set by the admin app: new_arrival, trending, best_seller, featured, offer
  tags                text[] NOT NULL DEFAULT '{}',
  sold_count          int NOT NULL DEFAULT 0,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX products_category_idx ON products(category_id) WHERE active;
CREATE INDEX products_tags_idx ON products USING gin(tags);

CREATE TABLE customers (
  id            serial PRIMARY KEY,
  name          text NOT NULL,
  mobile        text NOT NULL UNIQUE,
  email         text,
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE addresses (
  id          serial PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label       text NOT NULL DEFAULT 'Home',
  name        text NOT NULL,
  mobile      text NOT NULL,
  house       text NOT NULL,
  street      text NOT NULL DEFAULT '',
  area        text NOT NULL,
  city        text NOT NULL,
  state       text NOT NULL,
  pincode     text NOT NULL,
  landmark    text NOT NULL DEFAULT '',
  is_default  boolean NOT NULL DEFAULT false
);

CREATE TABLE wishlist (
  customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  product_id  int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (customer_id, product_id)
);

CREATE SEQUENCE order_number_seq START 1001;

CREATE TABLE orders (
  id                     serial PRIMARY KEY,
  order_number           text NOT NULL UNIQUE DEFAULT ('JW' || nextval('order_number_seq')),
  customer_id            int REFERENCES customers(id) ON DELETE SET NULL,
  guest_token            text,
  contact_name           text NOT NULL,
  contact_mobile         text NOT NULL,
  shipping_address       jsonb NOT NULL,
  delivery_instructions  text NOT NULL DEFAULT '',
  payment_method         text NOT NULL CHECK (payment_method IN ('upi','cod')),
  payment_status         text NOT NULL DEFAULT 'pending'
                         CHECK (payment_status IN ('pending','verification_pending','verified','failed')),
  payment_reference      text,
  subtotal_paise         int NOT NULL,
  product_discount_paise int NOT NULL,
  upi_discount_percent   numeric(5,2) NOT NULL DEFAULT 0,
  upi_discount_paise     int NOT NULL DEFAULT 0,
  delivery_charge_paise  int NOT NULL DEFAULT 0,
  total_paise            int NOT NULL,
  status                 text NOT NULL DEFAULT 'new'
                         CHECK (status IN ('new','confirmed','preparing','ready_for_delivery','out_for_delivery','delivered','cancelled')),
  delivery_agent_name    text,
  delivered_at           timestamptz,
  cancelled_at           timestamptz,
  cancel_reason          text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_customer_idx ON orders(customer_id, created_at DESC);

CREATE TABLE order_items (
  id                  serial PRIMARY KEY,
  order_id            int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id          int REFERENCES products(id) ON DELETE SET NULL,
  sku                 text NOT NULL,
  name                text NOT NULL,
  image_url           text,
  unit_original_paise int NOT NULL,
  unit_price_paise    int NOT NULL,
  quantity            int NOT NULL CHECK (quantity > 0)
);

CREATE TABLE order_status_history (
  id         serial PRIMARY KEY,
  order_id   int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE replacement_requests (
  id            serial PRIMARY KEY,
  order_id      int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id int NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
  customer_id   int REFERENCES customers(id) ON DELETE SET NULL,
  issue         text NOT NULL CHECK (issue IN ('wrong_product','damaged','manufacturing_defect')),
  description   text NOT NULL DEFAULT '',
  photos        text[] NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'requested'
                CHECK (status IN ('requested','under_review','approved','rejected','replacement_preparing','replacement_delivered','completed')),
  admin_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- customer_id NULL = broadcast (promotions) to every customer.
CREATE TABLE notifications (
  id          serial PRIMARY KEY,
  customer_id int REFERENCES customers(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  link        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_customer_idx ON notifications(customer_id, created_at DESC);

CREATE TABLE notification_reads (
  customer_id     int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  notification_id int NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  PRIMARY KEY (customer_id, notification_id)
);

CREATE TABLE push_subscriptions (
  id          serial PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  keys        jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- triggers ----------

CREATE FUNCTION order_status_changed() RETURNS trigger AS $$
DECLARE
  t text;
  b text;
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

  INSERT INTO order_status_history (order_id, status) VALUES (NEW.id, NEW.status);

  IF TG_OP = 'UPDATE' AND NEW.status = 'cancelled' THEN
    -- give the stock back whoever cancels (customer here, or staff in the admin app)
    UPDATE products p SET stock = p.stock + i.quantity, sold_count = greatest(p.sold_count - i.quantity, 0)
      FROM order_items i WHERE i.order_id = NEW.id AND i.product_id = p.id;
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
  b := 'Order ' || NEW.order_number;
  IF NEW.customer_id IS NOT NULL THEN
    INSERT INTO notifications (customer_id, type, title, body, link)
    VALUES (NEW.customer_id, 'order', t, b, '/orders/' || NEW.order_number);
  END IF;
  PERFORM pg_notify('order_update', json_build_object('order_id', NEW.id, 'customer_id', NEW.customer_id)::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION order_status_stamp() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'delivered' AND NEW.delivered_at IS NULL THEN NEW.delivered_at := now(); END IF;
  IF NEW.status = 'cancelled' AND NEW.cancelled_at IS NULL THEN NEW.cancelled_at := now(); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER orders_stamp BEFORE INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION order_status_stamp();
CREATE TRIGGER orders_status AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION order_status_changed();

CREATE FUNCTION replacement_status_changed() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.customer_id IS NOT NULL THEN
    INSERT INTO notifications (customer_id, type, title, body, link)
    SELECT NEW.customer_id, 'replacement',
           'Replacement ' || replace(NEW.status, '_', ' '),
           'Order ' || o.order_number, '/orders/' || o.order_number
      FROM orders o WHERE o.id = NEW.order_id;
    PERFORM pg_notify('order_update', json_build_object('order_id', NEW.order_id, 'customer_id', NEW.customer_id)::text);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER replacement_status BEFORE UPDATE ON replacement_requests FOR EACH ROW EXECUTE FUNCTION replacement_status_changed();

CREATE FUNCTION notification_created() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('notification', json_build_object('id', NEW.id, 'customer_id', NEW.customer_id)::text);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER notification_created AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION notification_created();

CREATE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER products_touch BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER settings_touch BEFORE UPDATE ON store_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE FUNCTION settings_changed() RETURNS trigger AS $$
BEGIN PERFORM pg_notify('settings', ''); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER settings_changed AFTER UPDATE ON store_settings FOR EACH ROW EXECUTE FUNCTION settings_changed();
