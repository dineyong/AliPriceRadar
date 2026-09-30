# AliPriceRadar

AliExpress 상품 후보를 자동 발견하고, 동일한 시장 조건에서 가격을 매일 관측해 가격 하락 후보를 찾기 위한 프로젝트입니다.

현재 단계는 Affiliate API 인증과 KR/KRW 가격 필드 검증용 PoC입니다. Instagram 게시 및 카드 생성은 포함하지 않습니다.

## Architecture

```text
Discovery providers
  - Affiliate search / hot products (planned primary source)
  - AliCouponFind feed (planned integration)
  - Playwright search discovery (API-independent PoC)
  - Fixed watchlist (PoC stability test only)
          |
          v
Product catalog -> Daily observations -> PostgreSQL history
                                      -> Playwright evidence audit
```

Watchlists are not the final product model. `DiscoveryProvider` allows automatic sources to continuously add thousands of candidates without changing the observation schema.

## Requirements

- Git
- Node.js 24.15.0 and npm 11
- A PostgreSQL database reachable from both development computers
- AliExpress Affiliate API App Key, App Secret, and Tracking ID

## First setup on Windows or macOS

```bash
git clone <repository-url>
cd AliPriceRadar
npm ci
cp .env.example .env
```

On PowerShell, replace the last command with:

```powershell
Copy-Item .env.example .env
```

Fill `.env` with the same `DATABASE_URL` and AliExpress credentials on each computer. Never commit `.env`.

Create the schema and check the database connection independently of AliExpress credentials:

```bash
npm run db:migrate
npm run db:check
npm run db:smoke
```

`db:smoke` inserts five temporary products and eight daily observations inside a transaction, verifies the seven-day drop ranking, and rolls the transaction back. No smoke-test rows remain in PostgreSQL.

After Affiliate credentials are available, run the five-product API probe:

```bash
npm run api:probe
```

The probe tests authentication, searches five real products, requests their details under `KR` / `KRW`, prints the price fields, and writes the full raw response to `reports/api-probe.json`. Reports are ignored by Git.

## Playwright sample audit

Install the pinned Chromium build once on each computer:

```bash
npm run playwright:install
```

Then audit the five public-search samples in a Korean browser context:

```bash
npm run audit:playwright
```

Reanalyze previously saved HTML without contacting AliExpress:

```bash
npm run audit:reanalyze
```

The audit stores HTML, full-page screenshots, and `audit.json` under `reports/playwright-audit/`. It scopes price evidence to the main product panel, keeps recommendation prices separate, detects soft-404 pages, and records conditional promotion text beside the displayed price. It does not select a tracking price or write observations to PostgreSQL.

Displayed prices marked as new-member, coupon, welcome, or app-only are classified as non-comparable. Only an unqualified main-panel display price is eligible for a future daily history, and it remains an advertised product price rather than a guaranteed checkout price.

The committed sample list is only a PoC input. It contains five recently indexed AliExpress product IDs found through public search because direct AliExpress browsing was unavailable in the development environment. It is not a claim that these are AliExpress's live top-five products. Future automatic discovery providers will replace this list.

## Automatic candidate discovery

The API-independent discovery PoC searches the queries in `config/discovery-seeds.json`, extracts stable AliExpress product IDs from result links, removes duplicates across seeds, and stores both the products and their discovery provenance in PostgreSQL:

```bash
npm run db:migrate
npm run discover:playwright
```

The default run stores up to 50 unique candidates. To use another seed file or limit:

```bash
npm run discover:playwright -- config/discovery-seeds.json 100
```

Each run is recorded in `discovery_runs`; each candidate records its seed, search rank, and run ID in `candidate_discoveries`. A local diagnostic copy is written to `reports/playwright-discovery/discovery.json` and remains excluded from Git. Search discovery is a fallback/proof of concept, not a guarantee of stable AliExpress access; Affiliate API discovery remains the preferred production source.

## Playwright price collection

Collect detailed page evidence for candidates that have not yet been observed today:

```bash
npm run collect:playwright -- 10
```

The argument is the maximum number of candidates, from 1 to 100. Collection uses a `ko-KR` browser context and stores one `product_display` observation per selected product. Only an unconditional main-panel KRW price is written to `sale_price` and becomes eligible for seven-day comparison. A detected new-member price is stored separately in `new_user_price`; coupon, app-only, unavailable, blocked, and unknown states retain their evidence in `raw_payload` without becoming a comparable price.

Generated collection reports are written under `reports/playwright-collection/` and are excluded from Git. Running the command again on the same day selects other unobserved candidates rather than duplicating today's observations.

## History report and daily run

Inspect daily coverage and the current seven-day price-drop ranking:

```bash
npm run history:report
```

Until observations have accumulated around seven days apart, the ranking is expected to be empty. The report uses only comparable `sale_price` observations from the same `KR` / `KRW` / `product_display` scope and writes a local copy to `reports/price-history/latest.json`.

Run the complete local cycle with one command:

```bash
npm run daily:run
```

GitHub Actions also contains a scheduled workflow for 05:15 KST each day and a manual `workflow_dispatch` button. Before enabling it, add a repository Actions secret named `DATABASE_URL` under **Settings > Secrets and variables > Actions**. The workflow never receives AliExpress API credentials. Hosted runners can still encounter AliExpress bot checks, so workflow failures must remain visible and local collection stays available as a fallback.

## Optional local PostgreSQL

For isolated development only:

```bash
docker compose up -d
```

Use `postgresql://aliprice:aliprice@localhost:5432/aliprice` in `.env`. This local database does not synchronize between computers; the shared managed PostgreSQL database remains the source of truth for operational price history.

## Daily Git workflow

Start work:

```bash
git pull
npm ci
```

Finish work:

```bash
git status
npm test
npm run check
git add .
git commit -m "Describe the completed change"
git push
```

Operational database records, `.env`, logs, and generated reports are never committed.

## Current price-history boundary

- Discovery sources are replaceable providers; the fixed watchlist exists only for collection-stability tests.
- Every observation preserves all returned price fields and its raw source payload.
- Playwright's unconditional KRW product display is stored in `sale_price`. This does not decide which Affiliate API field (`sale_price`, `target_sale_price`, `app_sale_price`, or `target_app_sale_price`) will become the production tracking price after API access is available.
- A baseline is the nearest comparable observation around seven days earlier, using the same product, price scope, country, and currency.
