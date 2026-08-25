# Foundation Monthly Donation System

A web system for collecting monthly donations from foundation members through
**SSLCommerz**, with every transaction recorded in **Supabase (PostgreSQL)**.

Members are added by an administrator. There is no member self-registration —
a member identifies themselves on the public donation page using their **member
code + registered phone number**, then pays through the SSLCommerz gateway.

---

## 1. How it works

```
 Member                Web app              Edge Functions           SSLCommerz          Database
   │                     │                        │                      │                  │
   │  code + phone       │                        │                      │                  │
   ├────────────────────►│   member-lookup        │                      │                  │
   │                     ├───────────────────────►│  verify phone        │                  │
   │                     │                        ├─────────────────────────────────────────►│
   │  ◄──── name + 12-month payment strip ────────┤                      │                  │
   │                     │                        │                      │                  │
   │  pick month, pay    │                        │                      │                  │
   ├────────────────────►│   payment-init         │                      │                  │
   │                     ├───────────────────────►│  insert PENDING      │                  │
   │                     │                        ├─────────────────────────────────────────►│
   │                     │                        │  open session        │                  │
   │                     │                        ├─────────────────────►│                  │
   │  ◄──────────── redirect to gateway page ─────┴──────────────────────┤                  │
   │                                                                     │                  │
   │  pays by card / bKash / Nagad / Rocket / bank                       │                  │
   ├────────────────────────────────────────────────────────────────────►│                  │
   │                                              payment-ipn            │                  │
   │                                        ◄─────┤  IPN + redirect ─────┤                  │
   │                                              │  re-validate ───────►│                  │
   │                                              │  ◄─── VALID ─────────┤                  │
   │                                              │  mark SUCCESS ──────────────────────────►│
   │  ◄─────────── returned to app with result ───┘                                          │
```

**The key safety rule:** a donation is *never* marked paid because the browser
came back with a success URL. The `payment-ipn` function calls the SSLCommerz
**validation API** using your store credentials and independently checks that
the transaction ID, amount, and currency all match the record it created. Only
then does it write `SUCCESS`. This is what prevents someone from faking a
payment by editing the return URL.

---

## 2. Components

### Supabase project

| Item | Value |
|---|---|
| Project ref | `ocfdnzokcbdzpnmxahtp` |
| Project name | DONATION |
| Region | ap-south-1 (Mumbai) |
| API URL | `https://ocfdnzokcbdzpnmxahtp.supabase.co` |

### Edge Functions

All three are public (`verify_jwt = false`) because donors have no login. Each
implements its own verification instead.

| Function | Auth model | Purpose |
|---|---|---|
| `member-lookup` | Requires matching member code **and** phone | Returns that member's name, monthly amount, and 12-month payment strip. Never returns a list or another member's data. |
| `payment-init` | Same code + phone check | Creates a `PENDING` donation row, opens an SSLCommerz session, returns the gateway URL. Refuses if the month is already paid. |
| `payment-ipn` | SSLCommerz validation API | Receives the IPN callback and the success/fail/cancel browser redirects. Validates, then settles the donation. Idempotent. |

### Frontend

Single self-contained file: `index.html`. No build step, no dependencies to
install — it loads Supabase JS and fonts from CDN.

- **Donate tab** — public. Member code + phone, 12-month strip, month selection, payment.
- **Admin tab** — Supabase Auth sign-in. Stats, member roster, transaction ledger, CSV export, member creation, foundation settings.

Admin sessions use `persistSession: false`, so closing the tab signs you out.

---

## 3. Database schema

### `members`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `member_code` | text | Auto-issued: `U13-001`, `U13-002`, … |
| `full_name` | text | Required |
| `phone` | text | Required — used for donor verification |
| `email` | text | Optional |
| `address` | text | Optional |
| `monthly_amount` | numeric | Default 500 |
| `join_date` | date | Defaults to today |
| `status` | text | `active` / `inactive` |
| `notes` | text | Optional |
| `created_by` | uuid | Admin who added them |
| `created_at` / `updated_at` | timestamptz | |

### `donations`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `member_id` | uuid | → `members.id` |
| `tran_id` | text | Our ID: `DON-<timestamp>-<random>` |
| `amount` | numeric | What the member was asked to pay |
| `currency` | text | `BDT` |
| `donation_month` | date | Always the 1st of the month being settled |
| `status` | text | `PENDING` → `SUCCESS` / `FAILED` / `CANCELLED` |
| `val_id` | text | SSLCommerz validation ID |
| `bank_tran_id` | text | Bank's reference |
| `card_type`, `card_issuer`, `card_brand` | text | How they paid |
| `store_amount` | numeric | **Net amount you actually receive** after gateway fees |
| `risk_level` | text | SSLCommerz fraud signal |
| `gateway_response` | jsonb | Full validation payload |
| `validated_at`, `paid_at` | timestamptz | |
| `failure_reason` | text | Why it failed, if it did |
| `created_at` / `updated_at` | timestamptz | |

Note the difference between `amount` (what the donor paid) and `store_amount`
(what lands in your account). The gateway fee is the gap.

### `sslcommerz_logs`

Append-only audit trail. Every gateway interaction is written here with its raw
payload — `INIT`, `INIT_ERROR`, `IPN`, `REDIRECT_SUCCESS`, `REDIRECT_FAIL`,
`REDIRECT_CANCEL`, `VALIDATE`, `VALIDATE_ERROR`. This is where you look when a
member says they paid but the record disagrees.

### `foundation_settings`

Single row (`id = 1`): foundation name, contact details, currency, default
monthly amount. Publicly readable so the donation page can show your name;
writable by admins only.

### `app_admins`

Links a Supabase Auth user to admin rights. A user with no row here cannot read
anything.

### Views and functions

| Object | Returns |
|---|---|
| `v_member_donation_summary` | Per member: total given, months paid, pending/failed counts, last payment |
| `v_monthly_collection` | Per month: members paid, gross collected, net received, failed/pending counts |
| `member_unpaid_months(uuid)` | Outstanding months for one member |
| `dashboard_stats()` | Headline numbers for the admin console |
| `promote_admin(email, name)` | Grants admin rights to an existing auth user |
| `is_admin()` | Used internally by RLS policies |

### Security

Row Level Security is on for every table. Members, donations, and logs are
readable and writable **only** by users listed in `app_admins`. The anonymous
key can read nothing except `foundation_settings`. All donor-facing data access
goes through the Edge Functions, which use the service role key server-side and
enforce the code + phone check themselves.

---

## 4. Setup

### Step 1 — SSLCommerz credentials

**Sandbox (for testing, available immediately):** register at
`sandbox.sslcommerz.com`. Free, no documents, instant Store ID and Store
Password.

**Live (for real money):** register at `sslcommerz.com` and submit your
foundation's registration certificate or trade licence, bank account details,
TIN, and contact information. Approval typically takes a few working days.

### Step 2 — Set the Edge Function secrets

Supabase Dashboard → **Edge Functions → Secrets**:

| Secret | Sandbox value | Live value |
|---|---|---|
| `SSLCOMMERZ_STORE_ID` | sandbox store id | live store id |
| `SSLCOMMERZ_STORE_PASSWD` | sandbox password | live password |
| `SSLCOMMERZ_SANDBOX` | `true` | `false` |
| `APP_BASE_URL` | where `index.html` is hosted | same |

Going live is a credential swap. No code changes.

### Step 3 — Create your admin account

1. Dashboard → **Authentication → Users → Add user**. Set an email and password.
2. Dashboard → **SQL Editor**, run:

```sql
select public.promote_admin('you@example.com', 'Your Name');
```

### Step 4 — Host the page

`index.html` is static — any host works (Vercel, Netlify, cPanel, Cloudflare
Pages). Whatever URL you land on goes into `APP_BASE_URL`.

### Step 5 — Register the IPN URL

In your SSLCommerz merchant panel, set the IPN URL to:

```
https://ocfdnzokcbdzpnmxahtp.supabase.co/functions/v1/payment-ipn
```

The success, fail, and cancel URLs are sent with each transaction
automatically — you don't need to configure those.

---

## 5. Testing

A test member is already seeded:

| Field | Value |
|---|---|
| Member code | `MEM-00001` |
| Phone | `01711111111` |
| Monthly amount | 500 BDT |

Once the sandbox secrets are set, open the page, enter those two values, pick a
month, and continue to payment. Use the test cards listed in your SSLCommerz
sandbox panel.

Remove the test member when you're done:

```sql
delete from public.members where member_code = 'MEM-00001';
```

### What to verify

- A completed payment shows `SUCCESS` in the admin ledger with a `val_id` and a `store_amount`.
- An abandoned payment shows `CANCELLED`, not `PENDING`.
- Paying the same month twice is refused.
- `sslcommerz_logs` has an `INIT`, an `IPN`, and a `VALIDATE` row for each attempt.

---

## 6. Daily use

**Adding a member.** Admin → Add member. Name and phone are required; the
member code is issued automatically. Give the member their code — they need it
plus the phone number on file to pay.

**Checking who has paid.** Admin → Members shows total given, months paid, and
last payment date per member. Admin → Donations is the full transaction ledger,
filterable by status and month. Both export to CSV.

**A member says they paid but it shows pending.** Look in `sslcommerz_logs`
filtered by their `tran_id`. If there's an `IPN` row but no `VALIDATE` row, the
validation call failed — usually a wrong or missing store password. If there's
no `IPN` row at all, the IPN URL isn't registered in your merchant panel.

**Deactivating a member.** Admin → Members → Deactivate. They keep their history
but can no longer start a payment.

---

## 7. Known limits

- **Not auto-recurring.** SSLCommerz's standard checkout charges once. Members initiate each month's payment themselves. True auto-debit needs SSLCommerz's subscription product and a separate agreement with them.
- **Phone as the verification factor.** Anyone who knows a member's code and phone number can pay on their behalf. Since the only action available is *giving money to the foundation*, the risk is low — but it is not authentication, and it should not be extended to anything else without adding a real login.
- **Admin sessions don't persist.** Closing the tab signs you out. This is deliberate.
- **BDT only.** The currency is fixed throughout.

---

## 8. Possible next steps

- SMS or email receipt on successful payment
- Automated monthly reminders to members with outstanding months
- Printable yearly donation certificate per member
- Offline payment recording, for members who pay cash at the office
- Bengali language toggle on the donor page
