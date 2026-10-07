# AliPriceRadar — Single Product Threads MVP

2026-10-07, Asia/Seoul. Status: **IMPLEMENTED / OFFLINE VERIFIED / LIVE ACCEPTANCE PENDING**.

This is a narrow first-post path; the existing PostgreSQL discovery, observations and seven-day analysis remain available. No migration, scheduler change, browser collection, AI dependency or web UI was added. Existing API client/signature/config are reused. The preceding [audit](threads-mvp-audit.md) describes the starting point, not current implemented capabilities.

## Implemented path

One explicit product ID → existing productdetail.get → method business-success check → exact product identity / positive finite displayed-price pair / explicit matching currency → official link.generate → exact source URL/affiliate URL validation → Korean template provider → private draft → reviewed hash / explicit publish → token account-ID check → TEXT container → publish → durable local attempt/result ledger.

Details and link generation require at most two calls. No auth/search-five probe, private session, imported cookies, scraper or automatic retry. API endpoint is fixed to the official TOP router in this CLI; custom endpoints cannot receive Affiliate secrets. Response bodies/headers/signatures are not logged or persisted. Product context defaults KR/KRW/KO but is not proof of shipping eligibility or final checkout price.

Price is target_sale_price with its own currency when present, otherwise sale_price with its own currency. Missing/mismatched target currency does not fall back to another pair. App/new-user/original prices are not substituted. Source discount is retained only as a bounded 1–99% string, otherwise null. When present, the template labels it source-reported with unverified reference/conditions; no historical-low, price-drop or unconditional savings claim. Existing history analysis is not silently used to justify a new claim.

ContentProvider can later be replaced; current Korean template preserves the original product title and adds price, observation time KST, checkout-condition caveat, link and Affiliate disclosure. It is not automatic translation. Output must fit 500 Unicode code points. Currency is explicit, no `$` inference.

## Commands

From the repository root with Node dependencies installed:

```sh
npm run threads:mvp -- check
npm run threads:mvp -- demo
npm run threads:mvp -- prepare --product-id PRODUCT_ID
```

`check` prints credential names/presence only, with no network/DB write. `demo` generates clearly marked FIXTURE data without network and is refused by the publisher. Neither command posts anything. `prepare` requires Affiliate credentials and generates a LIVE_API draft; it never calls Threads.

Drafts are written exclusively under ignored `reports/threads-mvp`, directory0700/file0600. Open the returned JSON locally, review exact text, factual price/conditions, destination account and Affiliate link. Do not put secret values in a draft or chat. To publish **only after explicit approval of the reviewed text**:

```sh
npm run threads:mvp -- publish --draft reports/threads-mvp/LIVE_DRAFT_FILENAME.json --approve-hash REVIEWED_CONTENT_HASH --publish
```

Pass the actual filename printed by prepare (lowercase `live_api-...json`), not the illustrative placeholder. Draft must be inside that private directory, not a symlink, pass strict schema/hash checks and be at most24hours old. Editing text requires an updated hash; the hash is an accidental-edit/approval guard, not a signed source attestation. No full API responses or operational PostgreSQL data are required.

The configured Threads user ID is checked against `GET /me?fields=id` using the supplied token before any content POST. Only ID is requested. No profile fields are exported. Token is sent only in the Bearer header to fixed HTTPS graph.threads.net; redirects are refused. TEXT creation does not enable auto_publish_text. Posting uses separate container/publish endpoints and returns confirmed container/post IDs. A returned post ID is an API acknowledgment, not independent proof of public visibility; live acceptance includes checking the actual post in Threads.

The private ledger locks account+product before network activity, synchronously flushes every state, records safe IDs/status only, and refuses another attempt for that product even if text changes. Crash, HTTP failure or timeout remains UNKNOWN and blocks automatic retry. Do not remove/reset a ledger to force a retry: reconcile the original container/post with Threads first. There is no automatic UNKNOWN recovery or repeat-product scheduling in this first-post MVP. Local result storage is not shared across computers; keep one posting machine/ledger for acceptance.

## Required personal actions

No required credentials were present in this repository's environment at verification. No credentials were copied from AliCouponFind, read from another account or requested in chat.

1. Choose one real AliExpress product ID.
2. Set own approved ALIEXPRESS_APP_KEY, ALIEXPRESS_APP_SECRET, ALIEXPRESS_TRACKING_ID locally in ignored `.env` or secret manager. Confirm productdetail.get and link.generate access. No DATABASE_URL is needed for this path.
3. Prepare own Meta app/Threads account and authorized user token with threads_basic / threads_content_publish; set THREADS_USER_ID and THREADS_ACCESS_TOKEN locally. App registration, account consent, test-user acceptance and possible review are personal gates. This MVP does not implement OAuth or token refresh and does not ask for app-secret values.
4. Run prepare, review the exact Korean draft and explicitly authorize the first public test post. Then verify the returned post ID/content/link in Threads. The agent has not executed publication.

Required scopes and account readiness must be checked in the actual Meta dashboard/token; environment presence alone is not readiness. API business failure, no product, currency/link mismatch or expired token stops the path. No automated daily posting until this real acceptance succeeds.

## Validation and limits

- `npm run check`: PASS, TypeScript strict compilation.
- `npm test`: 5 files /45 tests PASS, including all15 prior tests.
- Coverage: price/currency isolation, app-price refusal, numeric bounds, product duplicates, Affiliate source/host matching, business failures, sanitized errors, Korean disclosure/limit, content tampering, exact two-call API orchestration, Threads token-account matching/Bearer/two-step protocol, success ledger, concurrent duplicate refusal, ambiguous failure persistence, stale/future/unapproved/synthetic refusal and symlink refusal.
- CLI check: all five credential presence flags false; no DB required, source API called=false, posted=false.
- Offline CLI demo: FIXTURE draft created with private permissions; no network or actual Affiliate/post acceptance. Demo output is ignored, not in Git.
- macOS Node24.15.0 tested. TypeScript uses portable path/fs APIs; Windows preparation is not executed here. Live publication explicitly refuses Windows until a private NTFS ACL equivalent is verified. POSIX mode bits are not claimed to secure Windows files. No portability rewrite of prior commands.
- Live product/detail/link, actual token scopes, container readiness and final visible post remain untested. Remote failure is safely locked rather than blindly retried. No claim of successful end-to-end live publication.

Sources consulted: [Alibaba official link.generate schema](https://developer.alibaba.com/docs/api.htm?apiId=45804), [Meta-owned Threads API collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api). Meta developer pages returned unavailable/429 in this environment; no non-primary API contract was substituted. Live credential-backed acceptance remains necessary.

## Git / next gate

Branch: `codex/threads-single-product-mvp`, based on main `6ed57ab4589407e393986250ec55cafd03266d78`. Meaningful code/tests/docs are committed and pushed; implementation is offered in a separate PR, without main merge. Previous audit document is retained with its historical date/scope.

Next minimum gate: personal credentials + one product + reviewed first post. No additional architecture, DB migration or AI recommendation phase precedes that gate.
