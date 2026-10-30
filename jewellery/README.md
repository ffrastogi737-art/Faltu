# Jewellery shop: customer PWA, owner control center, shared backend

A two-app system for a local artificial-jewellery shop. Both apps use **one backend and one PostgreSQL database**.

```
jewellery/
  backend/        shared REST API + PostgreSQL schema (Node, Express, pg, sharp)
                    /api/*        customer API (App 1)
                    /api/admin/*  owner / admin / employee API (App 2), staff tokens only
  customer-app/   App 1: customer shopping PWA (React, TypeScript, Tailwind)
  admin-app/      App 2: owner, admin & employee control center (React, TypeScript, Tailwind), served at /admin
```

Business rules live in one place: prices and the UPI discount in `backend/src/pricing.js`, UPI links in `backend/src/upi.js`,
and order history, stock movements, stock restore on cancel and customer notifications in database triggers
(`backend/db/*.sql`), so a change from either app behaves the same.

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

# 3. first owner login (no default password exists)
STAFF_PASSWORD='choose-a-strong-one' npm run create-staff -- --name "Owner Name" --mobile 98XXXXXXXX --role owner

# 4. customer app
cd ../customer-app
npm install
npm run dev             # http://localhost:5173, proxies /api, /uploads, /manifest.webmanifest to :4000

# 5. admin app
cd ../admin-app
npm install
npm run dev             # http://localhost:5174/admin/
```

Admins and employees are then added by the owner in **Employees**. `create-staff` can also reset a forgotten owner password.

**Production (one origin):** `npm run build` in `customer-app` and `admin-app`, then run the backend with
`STATIC_DIR=../customer-app/dist ADMIN_STATIC_DIR=../admin-app/dist HOST=0.0.0.0 NODE_ENV=production AUTH_SECRET=... node src/server.js`
behind HTTPS (service workers, install and push need HTTPS). Customers open `https://your-domain/` and choose *Install app*;
staff use `https://your-domain/admin/`. Migrations run automatically on start and only ever add to the schema.
`npm run seed` refuses to run when `NODE_ENV=production` (pass `--force` only if you really want demo data).

| Env var | Purpose |
|---|---|
| `DATABASE_URL` | shared PostgreSQL (default `postgres://jewel:jewel@127.0.0.1:5432/jewellery`) |
| `AUTH_SECRET` | token signing key, **required** when `NODE_ENV=production` |
| `STATIC_DIR` | serve the built customer PWA from the API process |
| `ADMIN_STATIC_DIR` | serve the built admin app at `/admin` |
| `UPLOAD_DIR` | product images / replacement photos (default `backend/uploads`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push keys; auto-generated into `backend/.vapid.json` if unset |
| `CORS_ORIGINS` | comma-separated origins allowed to call the API (e.g. the admin app) |
| `SHOP_NAME`, `SHOP_UPI_ID`, `SHOP_WHATSAPP` | used only by `npm run seed` |
| `STAFF_PASSWORD` | password for `npm run create-staff` (otherwise it prompts) |

## Tests

```bash
cd backend && npm test                          # 21 API + DB integration tests (creates/drops jewellery_test, jewellery_admin_test)
cd customer-app && npm run build && npm run e2e  # customer journey in Chromium (creates/drops jewellery_e2e)
cd admin-app && npm run build && npm run e2e     # owner/admin/employee journey + customer sync (creates/drops jewellery_admin_e2e; needs customer-app built)
```

The admin e2e run covers owner/admin/employee login, store name + logo + app icon (with preview before save), UPI ID
validation and change, merchant name, new payment links using the new UPI ID, UPI discount change, the customer app
showing all of it, demo product identification → hiding → typed-confirmation removal (order history kept), real product
with two uploaded photos, price and stock updates reaching the customer product page, CSV import, order confirm/assign,
employee pick-up → out for delivery → delivered (no OTP) → cash recorded, owner UPI verification with bank reference,
replacement review with photos, role-based blocking, dashboard collected-money maths, CSV export and the audit log.

The e2e run covers: browse → search → product → wishlist → cart → guest UPI checkout → UPI deep link → "I have paid" →
staff verification → register → COD order → cancel (stock restored) → staff status changes appear live → replacement with
photo → notifications → owner changes UPI discount (appears live) → logout → offline reload.

## How money works

All amounts are integer paise and **decided by the server** (`backend/src/pricing.js`).
`POST /cart/quote` returns totals for both methods; `POST /orders` recomputes them inside a transaction with row locks on
the products, checks stock, and rejects the order (409 `PRICE_CHANGED`) if the total differs from what the customer saw.

- UPI discount = `round(selling subtotal × upi_discount_percent / 100)`, capped at `upi_discount_max_paise` (0 = no cap),
  only when `upi_discount_enabled`, the cart reaches `upi_discount_min_order_paise` and now is between the optional start/expiry dates. COD gets none.
  Each order stores the percentage and amount it was placed with, so later changes never alter past orders.
- Orders below `min_order_paise`, or to a PIN code outside `delivery_pincodes` (when set), are refused.
- Delivery = `delivery_charge_paise`, free when the selling subtotal ≥ `free_delivery_min_paise` (0 = never free).
- Example: ₹1,000 cart, 3% → UPI ₹970, COD ₹1,000.

### UPI

`upi://pay?pa=<upi_id>&pn=<payee>&tr=<order no>&tn=<shop> order <no>&am=<exact>&cu=INR` opens GPay / PhonePe / Paytm / any UPI app.
Returning to the app proves nothing, so payment stays **Payment Pending** until the customer taps *I have completed the payment*
(optional UTR) → **Verification Pending**. Only staff set **Payment Verified** / **Payment Failed** after checking the bank.
The app never asks for or stores a UPI PIN.

## App 2: owner control center

| Role | Can use |
|---|---|
| **Owner** | everything: dashboard & financial reports, payments (UPI verification), store settings (branding, UPI ID, merchant name, UPI discount, delivery, policy), offers & promotional notifications, demo-data removal, staff accounts, customer export, audit log |
| **Admin** | orders (confirm, status, assign, cancel), products, categories, inventory, CSV import, customers, replacements, inventory & replacement reports |
| **Employee** | only orders assigned to them: customer name, mobile, address, items, amount; mark picked up, out for delivery, delivered (no OTP); record cash collected |

Roles are enforced by the server on every `/api/admin` route (the UI only hides what the server already refuses).
Staff tokens are signed separately from customer tokens, and a deactivated account loses access on its next request.

**Money on the dashboard.** Sales = order value of non-cancelled orders. *Actual money collected* = UPI orders the owner
verified against the bank + cash an employee recorded. Unverified UPI never counts; it is shown separately as
*Pending UPI verification*, and undelivered cash as *Pending COD collection*. Days are Indian Standard Time.

**UPI verification** needs the transaction reference from the owner's own bank/UPI merchant account and an explicit
"credit checked" confirmation; the same bank reference cannot verify two orders. The customer's own reference is shown
for matching but is never enough on its own.

**Branding.** Store name, brand display name, logo, square app icon (auto-resized to 192/512 PNG), splash logo, description,
contacts, address, opening hours and social links live in `store_settings`. The customer app reads them from `/api/settings`
and the install manifest is generated from them at `/manifest.webmanifest`, so nothing is hard-coded in the frontend.

**Real products & photos.** JPG/PNG/WebP uploads are re-encoded on the server (EXIF rotation applied, metadata stripped,
max 1600 px WebP at high quality); videos (MP4/MOV/WebM, ≤ 50 MB) are stored as uploaded. Products that were ever ordered
can only be archived, not deleted; order lines always keep their own name/SKU/price snapshot.

**Demo data.** Seeded products are flagged `is_demo` (migration 002 detects products created by older seeds). The owner
can hide them from customers instantly, then remove them permanently by typing `REMOVE DEMO DATA`. Removal deletes only
demo products and their generated artwork; orders, order items, payments, customers and inventory history stay.

**Inventory.** Every stock change is written to `inventory_movements` by a trigger (opening stock, customer order,
cancellation restore, restock, damage, correction) with the staff member and order. Stock is reserved when an order is
placed and restored when it is cancelled; guarded updates make overselling impossible.

**Promotions.** Offers (festival / new collection / special, with dates) become the customer home-page banners.
Promotional notifications reach only customers who opted in (`customers.marketing_opt_in`, asked at registration and in
the account page); order updates are always sent.

**Audit log.** Logins, settings changes (with before/after values, payment settings marked separately), payment
verification, cash collection, status changes, assignments, product/category/staff changes, demo removal and exports.

**Writing from outside the API.** The triggers still apply if another tool updates the tables directly: change
`orders.status` / `payment_status`, `replacement_requests.status`, `store_settings`, `offers` or `products.stock`, and history,
notifications, stock logs and live updates follow.

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

## Admin API (`/api/admin`, staff bearer token)

| Area | Routes |
|---|---|
| Auth | `POST /auth/login`, `GET /me`, `POST /me/password`, `GET /events?token=` (live order changes) |
| Overview | `GET /alerts`, `GET /dashboard?from&to` (owner), `GET /reports/:type?from&to[&format=csv]`, `GET /audit` (owner) |
| Settings | `GET/PATCH /settings` (owner), `POST /uploads?kind=product|category|offer|video|logo|icon|splash` (raw file body) |
| Catalogue | `GET/POST /products`, `GET/PUT/DELETE /products/:id`, `POST /products/:id/archive`, `POST /products/:id/stock`, `POST /products/import`, `POST /products/tags`, `GET /inventory/movements`, `GET/POST /categories`, `PUT/DELETE /categories/:id`, `POST /categories/reorder` |
| Demo data | `GET /demo`, `POST /demo/remove {confirm:"REMOVE DEMO DATA"}` (owner) |
| Orders | `GET /orders?status&method&payment&codPending&employee&q&from&to&page`, `GET /orders/:n`, `POST /orders/:n/status`, `/assign`, `/pickup`, `/payment` (owner), `/cod`, `GET /my-orders` (employee) |
| People | `GET /customers`, `GET /customers/:id`, `GET /customers-export.csv` (owner), `GET/POST /staff`, `PUT /staff/:id`, `POST /staff/:id/password`, `GET /staff/:id/history` |
| Replacements | `GET /replacements?status`, `POST /replacements/:id/status` (rejection needs a reason) |
| Promotions | `GET/POST /offers`, `PUT/DELETE /offers/:id`, `POST /notifications/broadcast`, `GET /notifications/broadcasts` (owner) |

Reports: `daily-sales`, `weekly-sales`, `monthly-sales`, `upi-collection`, `cod-collection`, `upi-discount`, `product-sales`,
`employee-delivery` (owner) and `inventory`, `replacements` (owner + admin). CSV exports neutralise spreadsheet formulas.

## Policy

No return, no refund: there are no return or refund actions anywhere. Replacement only for wrong, damaged or
manufacturing-defective products, reported with photos within `replacement_window_hours` (default 3) of delivery; the
server enforces the window. The policy is shown on product, checkout and order pages and does not limit statutory consumer rights.
