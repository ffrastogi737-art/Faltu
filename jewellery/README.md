# Jewellery shop: customer PWA + shared backend

App 1 of a two-app system for a local artificial-jewellery shop.

```
jewellery/
  backend/        shared REST API + PostgreSQL schema (Node, Express, pg)  <- used by BOTH apps
  customer-app/   customer shopping PWA (React, TypeScript, Tailwind)      <- this project
```

The admin/employee app is a separate project. It must use the **same database and schema** (`backend/db/*.sql`); it adds its own staff endpoints to `backend/` or writes to the same tables. There is no second database and no customer-only business data.

## Run it

Requires Node 20+ and PostgreSQL 14+.

```bash
# 1. database
createuser -s jewel; createdb -O jewel jewellery     # or point DATABASE_URL anywhere

# 2. backend (migrates on start)
cd jewellery/backend
npm install
npm run seed            # optional: demo settings, 12 categories, 36 demo products (DB data, not app code)
AUTH_SECRET=change-me npm start          # http://127.0.0.1:4000

# 3. customer app
cd ../customer-app
npm install
npm run dev             # http://localhost:5173, proxies /api and /uploads to :4000
```

**Production (one origin, installable PWA):** `npm run build` in `customer-app`, then run the backend with
`STATIC_DIR=../customer-app/dist HOST=0.0.0.0 NODE_ENV=production AUTH_SECRET=... node src/server.js` behind HTTPS
(service workers, install and push need HTTPS). Customers open the link in Chrome → *Install app*.

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | shared PostgreSQL (default `postgres://jewel:jewel@127.0.0.1:5432/jewellery`) |
| `AUTH_SECRET` | token signing key, **required** when `NODE_ENV=production` |
| `STATIC_DIR` | serve the built PWA from the API process |
| `UPLOAD_DIR` | product images / replacement photos (default `backend/uploads`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push keys; auto-generated into `backend/.vapid.json` if unset |
| `CORS_ORIGINS` | comma-separated origins allowed to call the API (e.g. the admin app) |
| `SHOP_NAME`, `SHOP_UPI_ID`, `SHOP_WHATSAPP` | used only by `npm run seed` |

## Tests

```bash
cd backend && npm test                         # API + DB integration tests (creates/drops jewellery_test)
cd customer-app && npm run build && npm run e2e # full customer journey in Chromium (creates/drops jewellery_e2e)
```

The e2e run covers: browse → search → product → wishlist → cart → guest UPI checkout → UPI deep link → "I have paid" →
staff verification → register → COD order → cancel (stock restored) → staff status changes appear live → replacement with
photo → notifications → owner changes UPI discount (appears live) → logout → offline reload.

## How money works

All amounts are integer paise and **decided by the server** (`backend/src/pricing.js`).
`POST /cart/quote` returns totals for both methods; `POST /orders` recomputes them inside a transaction with row locks on
the products, checks stock, and rejects the order (409 `PRICE_CHANGED`) if the total differs from what the customer saw.

- UPI discount = `round(selling subtotal × store_settings.upi_discount_percent / 100)`. COD gets none.
- Delivery = `delivery_charge_paise`, free when the selling subtotal ≥ `free_delivery_min_paise` (0 = never free).
- Example: ₹1,000 cart, 3% → UPI ₹970, COD ₹1,000.

### UPI

`upi://pay?pa=<upi_id>&pn=<payee>&tr=<order no>&tn=<shop> order <no>&am=<exact>&cu=INR` opens GPay / PhonePe / Paytm / any UPI app.
Returning to the app proves nothing, so payment stays **Payment Pending** until the customer taps *I have completed the payment*
(optional UTR) → **Verification Pending**. Only staff set **Payment Verified** / **Payment Failed** after checking the bank.
The app never asks for or stores a UPI PIN.

## Contract for the admin / employee app

Write to the shared tables; the triggers in `db/001_init.sql` do the rest, so the customer app updates live (SSE + push):

| Admin action | SQL on the shared DB |
|---|---|
| Add/edit products, stock, merchandising | `products` (`tags`: `new_arrival`, `trending`, `best_seller`, `featured`, `offer`; `images` = URL array; `video_url` optional; `specifications` = JSON object) |
| Categories | `categories` (`active`, `sort_order`) |
| UPI ID, UPI discount %, delivery fee, WhatsApp, banners, replacement window, cancellable statuses | `UPDATE store_settings ... WHERE id = 1` |
| Move an order along | `UPDATE orders SET status = 'confirmed' / 'preparing' / 'ready_for_delivery' / 'out_for_delivery' / 'delivered'` |
| Assign delivery person | `orders.delivery_agent_name` |
| Verify / reject a UPI payment, mark COD collected | `orders.payment_status = 'verified' / 'failed'` |
| Cancel | `orders.status = 'cancelled'` (stock is restored by the trigger) |
| Review replacements | `replacement_requests.status` (`under_review`, `approved`, `rejected`, `replacement_preparing`, `replacement_delivered`, `completed`), `admin_note` |
| Promotional notification | `INSERT INTO notifications (customer_id, type, title, body, link) VALUES (NULL, 'promo', ...)` |

Triggers automatically: write `order_status_history`, stamp `delivered_at` / `cancelled_at`, restore stock on cancel,
create customer notifications, and `pg_notify` so connected customers see the change instantly. There is **no delivery OTP**:
the employee app simply sets `status = 'delivered'`.

## Customer API (`/api`)

| Method | Path | Notes |
|---|---|---|
| GET | `/settings` | public store settings (UPI %, delivery, WhatsApp, banners…) |
| GET | `/categories` | active categories with product counts |
| GET | `/products?category=&tag=&q=&sort=new\|popular\|price_asc\|price_desc\|discount&inStock=1&ids=&page=&limit=` | |
| GET | `/products/:slug` | detail + related |
| POST | `/cart/quote` | `{items:[{productId,quantity}]}` → lines, stock problems, `upi` and `cod` totals |
| POST | `/auth/register`, `/auth/login` | mobile + password → bearer token |
| GET/PATCH | `/me` · POST `/me/password` | profile |
| GET/POST/PUT/DELETE | `/me/addresses[/:id]` | saved addresses |
| GET/PUT/DELETE | `/me/wishlist[/:productId]` | |
| POST | `/orders` | guest or logged in; returns `guestToken` for guests (send as `X-Guest-Token`) |
| GET | `/orders`, `/orders/:number` | history / detail with timeline, UPI link, replacement deadline |
| POST | `/orders/:number/cancel` | only in `store_settings.cancellable_statuses` and no UPI payment on record |
| POST | `/orders/:number/payment-confirmation` | `{reference?}` → Verification Pending |
| POST | `/orders/:number/replacements` | `{orderItemId, issue, description, photos:[dataURL]}`; delivered + within window only |
| GET | `/notifications` · POST `/notifications/read` | in-app notifications |
| GET | `/push/public-key` · POST `/push/subscribe`, `/push/unsubscribe` | Web Push |
| GET | `/events?token=` | server-sent events: `order_update`, `notification`, `settings` |

## Policy

No return, no refund: there are no return or refund actions anywhere. Replacement only for wrong, damaged or
manufacturing-defective products, reported with photos within `replacement_window_hours` (default 3) of delivery; the
server enforces the window. The policy is shown on product, checkout and order pages and does not limit statutory consumer rights.
