# AliPriceRadar

AliExpress 상품 후보를 자동 발견하고, 동일한 시장 조건에서 가격을 매일 관측해 가격 하락 후보를 찾기 위한 프로젝트입니다.

현재 단계는 Affiliate API 인증과 KR/KRW 가격 필드 검증용 PoC입니다. Instagram 게시 및 카드 생성은 포함하지 않습니다.

## Architecture

```text
Discovery providers
  - Affiliate search / hot products (planned primary source)
  - AliCouponFind feed (planned integration)
  - Fixed watchlist (PoC stability test only)
          |
          v
Product catalog -> Daily observations -> PostgreSQL history
                                      -> Playwright sample audit (next phase)
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
```

After Affiliate credentials are available, run the five-product API probe:

```bash
npm run api:probe
```

The probe tests authentication, searches five real products, requests their details under `KR` / `KRW`, prints the price fields, and writes the full raw response to `reports/api-probe.json`. Reports are ignored by Git.

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
- Seven-day comparison requires an explicit price field. The code does not yet choose between `sale_price`, `target_sale_price`, `app_sale_price`, and `target_app_sale_price`.
- A baseline is the nearest comparable observation around seven days earlier, using the same product, price scope, country, and currency.
