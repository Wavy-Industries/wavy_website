# Tracking events — frontend → backend

All events POST `/api/tracking/event` with this envelope:

```json
{
  "visitor_id": "wv_xxxx",          // anonymous, lives in localStorage
  "event_type": "<see below>",
  "page_url": "/cart",              // pathname only
  "referrer": "https://...",        // external referrers only; undefined if internal
  "metadata": { /* event-specific */ }
}
```

Visitor id is generated client-side on first visit and persisted. There are
no cookies; tracking shares the same id with the cart store and other state.

A `ref` query param (e.g. `?ref=campaign`) is auto-captured and merged into
`metadata.ref` on every event for attribution.

## Conventions

- Use the durable **product code** (`WIMKY001`, `WIBRG001`) in tracking — never
  the internal sku slug (`monkey`, `bridge`). Mapping lives in
  `src/lib/config/products.ts`.
- Always pair price with currency. Never assume a default currency.
- One semantic event per user action. Don't overlay generic `click` events on
  top of named events (e.g. there is no separate `click:add_to_cart` — only
  `cart_add`).

## Event catalogue

### Funnel

| event_type | metadata | notes |
|---|---|---|
| `page_view` | _none_ | fires on every page load via `Layout.astro` |

### Commerce — cart lifecycle

All cart events carry the affected line in `code`/`qty`, plus the cart size
after the change so the admin view doesn't need to recompute.

| event_type | metadata | when |
|---|---|---|
| `cart_add` | `{ code, qty, cta?, cart_size }` | user clicks an Add-to-cart button; `cta` distinguishes which CTA (`hero`, `bottom`, …) |
| `cart_update` | `{ code, qty, qty_delta, cart_size }` | qty changed from the cart page or popup; `qty_delta` is signed (+1/-1) |
| `cart_remove` | `{ code, qty_removed, cart_size }` | item fully removed |
| `cart_clear` | `{ cart_size: 0 }` | cart emptied programmatically |

### Commerce — checkout

| event_type | metadata | when |
|---|---|---|
| `checkout_start` | `{ items: [{ code, qty, unit_price, currency }], subtotal, currency }` | user clicks "Continue to checkout"; hand-off to Shopify |
| `checkout_success` | `{ order_id?, items?, total?, currency? }` | `/monkey/purchase-success` loads (Shopify return URL); order_id may be absent until Shopify resolves it |
| `checkout_cancel` | _none_ | `/monkey/purchase-cancel` loads |

### Engagement

| event_type | metadata | when |
|---|---|---|
| `download` | `{ kind, code?, name, platform? }` | file downloads. `kind: 'app' \| 'template' \| 'firmware' \| 'asset'`. `code` is the product code if the download is tied to a product. |
| `newsletter_subscribe` | `{ tag?, source }` | newsletter signup success. `source: 'header' \| 'monkey_bottom' \| 'bridge' \| ...` |
| `notify_subscribe` | `{ code }` | back-in-stock notify form submitted |
| `feedback_submit` | `{ form, fields? }` | post-purchase feedback submitted |

## Admin view — recommended queries

- **Visitor cart timeline**: filter by `visitor_id` and `event_type IN
  (cart_add, cart_update, cart_remove, cart_clear, checkout_start)`, order by
  timestamp. The stream tells the story of what was added, dropped, and
  whether checkout was reached.
- **Current cart (best-effort)**: sum signed quantities per `code` for the
  visitor since the last `cart_clear` or `checkout_success`. Or, simpler: use
  the snapshot in the most recent `checkout_start`.
- **CTA conversion**: group `cart_add` by `cta` to see which placement drives
  more checkouts (compare to `checkout_start` events from the same visitors).
- **Pricing sensitivity**: `cart_add` → `cart_remove` for the same `code`
  within a session, joined with `checkout_start.unit_price`. Indicates
  hesitation around price.

## Notes on rollout

- The previous `click` events (with `button: 'add_to_cart'` / `'buy_now'`)
  are removed — they duplicated `cart_add` / `checkout_start`.
- Internal slugs (`monkey`, `bridge`) are no longer emitted as `sku` — only
  product codes (`WIMKY001`, `WIBRG001`) ship in `code`.
