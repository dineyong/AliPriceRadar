# AliPriceRadar — Threads MVP Audit

작성일: 2026-10-06 (Asia/Seoul). Repository: `dineyong/AliPriceRadar`.

## 기준 및 검증 범위

- audit 기준 최신 remote main: `6ed57ab4589407e393986250ec55cafd03266d78` (`Schedule daily price collection and history reports`). 새 clone의 HEAD와 `git ls-remote origin refs/heads/main`이 일치했다.
- 작업 branch: `codex/threads-mvp-audit`. 변경은 이 문서뿐이다. main merge, application 변경, workflow 실행/설정 변경은 하지 않았다.
- tracked source/config/tests/workflow를 검토하고, Node 24.15.0 / npm 11.12.1 / macOS에서 lockfile 설치 및 offline unit tests/typecheck를 실행했다.
- AliExpress live API, browser navigation, operational PostgreSQL 연결, migration, Threads 인증/게시를 실행하지 않았다. credential 보유/권한 및 실제 상품 취득 성공은 이번 audit에서 검증되지 않았다.
- AliCouponFind와 별도 저장소다. 해당 프로젝트의 credential, DB, Railway runtime, 수집 성공/실패를 이 프로젝트의 증거로 전용하지 않았다.

## 핵심 결론 및 A–G

현재는 **상품 discovery/가격 관측/7일 하락 보고 PoC**다. 상품 → Affiliate 링크 → 한국어 글 → Threads 게시 E2E는 없다. 기존 가격 이력 코드를 재작성할 필요는 없다.

| 질문 | 답 | 실제 근거 및 한계 |
|---|---|---|
| A. 실제 상품 1개 취득? | 코드 capability는 있음; live 성공은 미검증 | `AliExpressAffiliateClient.getDetails([id], country, currency, language)`로 1개 요청 가능. `searchFive`도 구현됨. 제공 CLI `api:probe`는 인증 → 검색 5개 → 상세를 요구하며 1개 전용 CLI는 없다. 유효 AppKey/권한/상품 응답이 전제다. |
| B. 가격 DB 저장? | 구현됨; 이번 연결 검증은 안 함 | `recordPriceObservation`, collection run, product upsert가 PostgreSQL에 저장. `collect:playwright`는 실제 저장 경로. API probe는 DB에 저장하지 않는다. |
| C. 동일 상품 가격 변화 기록? | 구현됨 | product source/ID unique + timestamp별 observation append. 과거 가격을 덮어쓰지 않는다. 같은 날 중복 방지는 candidate 조회 규칙일 뿐 DB unique constraint는 아니다. |
| D. 가격 하락 판정? | 구현됨, 범위 제한 | `findSevenDayPriceDrops`: 동일 상품/price_scope/country/currency, 7일 전 ±36시간 내 가까운 baseline, 현재가가 낮은 항목을 하락률 순 정렬. 단순 할인율과 역사적 가격 하락은 다르다. 충분한 이력이 없으면 결과 없음. |
| E. Affiliate URL 생성? | 전용 구현 없음 | `products.affiliate_url`과 repository 입력 칸은 존재. `tracking_id`를 상품 API에 전달하지만 요청 fields에 promotion link는 없고 결과를 연결하는 코드도 없다. generic `client.call`은 링크 method 추가 시 재사용 가능하지만 완성된 생성 기능은 아니다. |
| F. Threads 게시? | 없음 | client/OAuth/config/content generator/publish CLI/post 결과 storage 모두 없음. |
| G. 오늘 상품1 → 게시1에 부족한 것? | 1상품 orchestration, 링크 생성, 한국어 템플릿, Threads 인증/게시 및 결과 기록 | 계정/권한 준비와 실제 API 응답 확인이 외부 gate. 7일 이력 축적이나 대규모 discovery는 첫 게시의 선행조건이 아니다. |

## 프로젝트 구조와 실제 구현

```text
src/config.ts                   DB / Affiliate env 검증 (분리된 loader)
src/aliexpress/                 TOP HMAC/MD5 signature, generic call, search/detail
src/discovery/                  provider interface, fixed watchlist, Playwright 검색
src/playwright/                 main product panel 증거 추출/가격 조건 분류
src/db/                         PostgreSQL pool, SQL schema, repository
src/analysis/price-drop.ts       7일 비교 SQL + 하락률 계산
src/commands/                   10개의 tsx command
tests/                          4개 unit test 파일
config/                         검색 seeds / 5개 상품 audit sample
.github/workflows/              daily discovery/collection/report
docker-compose.yml              개발용 PostgreSQL 17.6 + named volume
reports/.gitkeep                생성 reports는 ignored
```

### AliExpress API

`src/aliexpress/client.ts`는 HTTPS TOP router에 URL-encoded POST를 전송한다. GMT+8 timestamp, HMAC-MD5 signing, 30초 timeout을 사용한다. 현재 methods는 `category.get` (인증 probe), `product.query` (검색), `productdetail.get` (상세) 세 개다.

검색은 `ship_to_country`, 상세는 `country`를 전달하고 target currency/language 및 tracking ID를 공통 사용한다. 제목/이미지/일반가/target가/app가/원가/할인율을 받을 타입과 fields가 있다. 실제 variant, 배송비, 구매 조건, 응답 가격 field의 tracking 의미는 확정되지 않았다. locale이나 KR 요청만으로 최종 한국 배송 가능/결제 가격을 보장하지 않는다.

`api:probe`는 full response를 ignored 로컬 report로 저장한다. 검색 결과가 정확히 5개 아니면 실패하고 DB 저장은 없다. 별도 Affiliate discovery provider나 API observation collector는 아직 없다. 첫 MVP에서 API client → repository의 짧은 adapter만 추가하면 된다.

현재 error 처리는 HTTP 오류와 `error_response`만 확인한다. method envelope 내부 business status, 응답 schema/빈 products/ID/가격을 fail-closed로 검증하는 부분이 부족하다. 재시도/backoff는 없고 API client mock tests도 없다. raw error JSON을 오류 문자열에 포함하므로 다음 phase에서는 safe error projection이 필요하다.

### Discovery와 가격 evidence

Playwright 검색 provider는 seed별 링크에서 stable 상품 ID를 추출하고 URL을 canonicalize하며 중복 제거한다. seed/rank/run provenance를 DB에 저장한다. `FixedWatchlistProvider`는 구현돼 있지만 API 기반 자동 discovery와 AliCouponFind feed는 계획 상태다.

수집은 `.pdp-info-right`와 가격/promotion selector를 사용한다. 신규회원/쿠폰/app-only 가격과 soft-404/blocked를 구분한다. 조건 없는 main-panel KRW 표시가격만 `sale_price`로 저장하고 신규회원가는 `new_user_price`로 분리한다. 표시 가격은 보장된 checkout 가격이 아니다. DOM 변경/차단에 취약하며 JSON-LD는 evidence로 저장하지만 tracking price의 자동 fallback으로 쓰지 않는다.

### Storage / history / deal detection

현재 backend storage는 **PostgreSQL만**이다. SQLite adapter/file DB/웹 API/server는 없다. 5개 tables: `products`, `discovery_runs`, `candidate_discoveries`, `collection_runs`, `price_observations`. 가격은 NUMERIC, raw payload/context는 JSONB. source/ID로 상품을 upsert하고 observation을 append한다.

history report는 일별 coverage, comparable/new-user count, 7일 하락 후보를 출력한다. deal threshold/최저가 보장/상품 품질 점수/게시할 상품 자동 선정/게시 후 성과 피드백은 없다. SKU 필드가 schema에 있지만 현재 7일 SQL 비교에는 SKU가 포함되지 않는다. 서로 다른 variant가 섞일 수 있어 다음 단계 글에서 역사적 딜 주장을 자동 만들지 않는다.

`db:migrate`는 CREATE IF NOT EXISTS/ALTER ADD COLUMN 형태의 schema bootstrap이며 versioned migration framework는 없다. 정상 수집은 DB writes를 수행한다. audit에서는 operational DB에 실행하지 않았다.

### Scheduler의 코드와 실제 상태

GitHub Actions workflow는 UTC `15 20 * * *` (KST 다음 날 05:15), manual dispatch, 동일 concurrency group, 45분 timeout이다. DB migrate → 최대100 discovery → 최대50 collection → report. Threads 게시나 AI 작업은 없다.

2026-10-06 read-only GitHub 확인에서 workflow는 **active**, 최근 조회 5건은 모두 **failure**였다. 최신 run `37242537511` (2026-10-04T23:06:25Z)은 dependency/browser 설치 성공 후 `db:migrate` 실패, 나머지 discovery/collection/report는 skipped였다. DB credential 부재인지 연결/SQL 문제인지는 step metadata만으로 확정하지 않았다. cron 정의가 있다는 것과 운영 수집 성공은 구분해야 한다. audit branch push로 workflow를 새로 실행시키는 push trigger는 없다.

[최신 확인 run](https://github.com/dineyong/AliPriceRadar/actions/runs/37242537511)

## 실행 가능한 CLI와 side effects

package.json은 `tsx`로 TS entrypoints를 실행한다. `npm start`, 별도 build/server entrypoint, Threads command는 없다. 저장소 root에서 실행한다.

| command | entrypoint / 조건 | side effects |
|---|---|---|
| `npm run db:migrate` | migrate.ts / DATABASE_URL | PostgreSQL schema 생성/변경 |
| `npm run db:check` | check-database.ts / DB | version/table/count read |
| `npm run db:smoke` | smoke-price-history.ts / schema 준비 DB | synthetic write 후 rollback; 운영 DB에 사용 금지 |
| `npm run api:probe` | probe-api.ts / Affiliate credential | 인증+검색+상세 호출, raw 로컬 report; DB 저장 없음 |
| `npm run playwright:install` | Chromium 설치 | 로컬 browser download |
| `npm run audit:playwright -- <sample-file>` | audit-playwright.ts | 페이지 접속, HTML/screenshot/report 저장; DB 없음 |
| `npm run audit:reanalyze -- <sample-file>` | reanalyze-playwright.ts | 기존 로컬 HTML 재분석; Chromium 필요 |
| `npm run discover:playwright -- <seeds> <limit>` | discover-playwright.ts / DB+Chromium | 검색 접속, catalog/provenance DB writes |
| `npm run collect:playwright -- 1` | collect-playwright.ts / 기존 DB 후보+Chromium | 오늘 미관측 후보 1개 수집/DB writes; 특정 ID 직접 선택 기능 아님 |
| `npm run history:report` | report-price-history.ts / DB | DB read + 로컬 JSON report |
| `npm run daily:run` | 위 4개 command 연결 | schema/discovery/collection 전체 실행; 첫 게시 MVP에 불필요 |
| `npm test`, `npm run check` | Vitest / TypeScript | 외부 API/DB 불필요 |

smoke 실제 코드는 5상품 ×8일 = **40 observations**를 transaction에 삽입한다. README의 “eight daily observations”는 전체 8건으로 읽으면 부정확하다. rows rollback과 별개로 PostgreSQL sequence 증가는 rollback되지 않으므로 운영 DB에 무영향 테스트로 취급하지 않는다.

## 테스트 결과 및 검증 공백

- `npm ci --ignore-scripts`: 성공, 65 packages 추가, npm audit summary 0 vulnerabilities.
- `npm test`: **4 files / 15 tests passed**. 가격 evidence 6, 검색 parsing/dedup 5, 하락 산술 3, signature 결정성 1.
- `npm run check`: 성공 (`tsc --noEmit`).
- live DB smoke/SQL integration, AliExpress request/response/auth integration, browser collection, Windows 실행, Threads는 **미실행/미검증**이다. unit test 통과를 live E2E 성공으로 표현하지 않는다.
- signature test는 순서 결정성/형식만 검증하고 공식 known vector나 API server 인증은 검증하지 않는다. 7일 SQL integration은 기존 smoke CLI에 있지만 unit suite에는 없다.

## Env / secrets / portability

현재 required env:

| 이름 | 필요한 기능 | 비고 |
|---|---|---|
| `DATABASE_URL` | DB commands/Playwright discovery·collection/history | PostgreSQL 접속 secret; 연결만으로 schema 보장 안 됨 |
| `ALIEXPRESS_APP_KEY` | Affiliate API | 승인된 app 및 method 권한 확인 필요 |
| `ALIEXPRESS_APP_SECRET` | Affiliate 서명 | secret manager/ignored 로컬 env에만 보관 |
| `ALIEXPRESS_TRACKING_ID` | Affiliate 상품/링크 | 본인 Affiliate 계정 tracking ID |

옵션: `ALIEXPRESS_API_URL`, `ALIEXPRESS_COUNTRY`, `ALIEXPRESS_CURRENCY`, `ALIEXPRESS_LANGUAGE`, `ALIEXPRESS_PROBE_KEYWORD` (현재 defaults TOP HTTPS / KR / KRW / KO / phone stand). DB와 Affiliate config loader가 분리되어 API probe에는 DATABASE_URL이 필요 없다. scheduled workflow에는 DATABASE_URL만 전달된다.

추가 phase의 제안 env 이름 (현재 코드에는 없음): `THREADS_USER_ID`, `THREADS_ACCESS_TOKEN`; OAuth 발급/refresh를 CLI가 담당할 경우 `THREADS_APP_ID`, `THREADS_APP_SECRET`, `THREADS_REDIRECT_URI`. 유효 user token을 안전하게 준비했다면 첫 publish path에는 app secret을 직접 전달할 필요가 없다. AI credential은 필요 없다. 값 자체를 이 보고서나 채팅에 요청하지 않는다.

Windows/macOS는 Node ESM/tsx, node:path, fileURLToPath, pg/fetch를 사용해 기본 구조가 이식 가능하다. `.nvmrc`는 Node 24.15.0, engines는 npm11; macOS unit/typecheck 확인 완료, Windows 실행은 미검증이다. Windows의 `.env` 복사는 PowerShell `Copy-Item`, bash `cp`는 README에서 별도 안내한다. npm script의 `&&`는 npm의 shell을 통해 실행된다. Chromium은 OS별 설치가 필요하고 PostgreSQL 연결 또는 Docker Desktop이 필요하다. 상대 config/report 경로는 repo root cwd에 의존한다. managed DB SSL/접속 정책은 실제 환경에서 별도로 확인해야 한다. dev Docker credential은 샘플이며 운영용이 아니다.

## 외부 공식 문서 대조

Alibaba 문서에 `aliexpress.affiliate.link.generate`가 존재하고 `promotion_link_type=0`, `source_values`, `tracking_id`로 상품 URL의 promotion link를 요청할 수 있다. 기존 generic `client.call`/signature를 재사용하는 wrapper가 최소 추가다. 문서 존재를 현재 AppKey 접근 성공으로 간주하지 않는다. [Alibaba 공식 API 문서](https://developer.alibaba.com/docs/api.htm?apiId=45804&source=search)

Meta 공식 Threads Postman collection에서 user OAuth와 text container/publish endpoint를 확인했다. MVP 권한은 `threads_basic` / `threads_content_publish`, user access token을 준비하고 TEXT 생성 → `threads_publish`로 게시한다. 최신 collection에는 `auto_publish_text`도 있지만 첫 구현은 container ID와 publish 결과를 기록하기 쉬운 두 단계 경로를 권장한다. 텍스트의 링크 preview를 사용할 수 있어 image hosting은 첫 성공의 선행조건이 아니다. [Meta 공식 Threads collection](https://www.postman.com/meta/threads/documentation/dht3nzz/threads-api), [공식 authorization 안내](https://www.postman.com/meta/threads/folder/34203612-e0373e84-de6b-46f1-b90d-3fea76ba6782)

Meta developer posts 페이지는 이번 조회에서 HTTP429라 직접 본문 확인에 실패했다. 공식 Meta collection을 사용했고 제3자 tutorial로 계약을 확정하지 않았다. app mode/tester 등록/계정 접근 조건은 개발자 dashboard에서 확인해야 하며, 자기 테스트 계정 성공과 외부 사용자 배포용 권한 심사는 별도 gate다.

## CURRENT_STATE

가격 history 기반은 이미 있다. API product retrieval client도 있다. **API 상품 → DB adapter / Affiliate link wrapper / 한국어 생성 / Threads publish / post ledger가 없다.** 운영 scheduler의 성공은 입증되지 않았고 최신 run은 migration에서 실패했다. 따라서 현재 코드만으로 오늘 바로 게시 command를 실행할 수는 없다.

## MISSING_FOR_MVP

1. 특정 product ID 1개를 입력받는 CLI와 응답 검증/안전한 가격 projection.
2. 공식 Affiliate link 생성 wrapper 및 source product URL과 응답 link 대응 검증.
3. 사실 기반 한국어 템플릿: 제목, 확인된 가격·통화·할인 조건, 관측시각, Affiliate 링크, 제휴 표시. 원문 제목이 한국어가 아니면 MVP에서는 한국어 설명 템플릿 안에 원문 제목을 그대로 표기하거나 사용자 제공 제목을 사용한다. 자동 번역을 허위로 약속하지 않는다.
4. 최소 Threads user token config/client, text container 생성·publish·결과 확인.
5. 한 실행의 product/input/observation/content hash/container ID/post ID/status를 남기는 최소 ledger. 첫 1회는 ignored private 로컬 JSON으로 충분하며 큰 DB migration을 막지 않는다. 이후 PostgreSQL ledger로 옮길 수 있다.
6. fixture/mock regression과 실제 credential 기반 1회 end-to-end acceptance. 이번 audit에는 실계정 검증을 포함하지 않았다.

## FASTEST_MVP_PATH

```text
사용자가 고른 실제 product ID 1개
→ 기존 client.getDetails([id], KR, KRW, KO)
→ 정상 상품/positive price/explicit currency/가격 조건 검증
→ 기존 client.call 기반 link.generate wrapper
→ TemplateContentProvider의 한국어 text
→ 기본 dry-run으로 글과 링크 확인
→ 명시적 publish 실행: Threads text container → publish
→ post ID/결과 기록, 재실행 중복 방지
```

첫 성공은 **TEXT + 링크 1건**, 가격 하락 발견은 필수 gate가 아니다. baseline이 없으면 “최저가/7일 하락” 대신 “현재 확인 가격”이라고 쓴다. API price field 선택은 실제 단일 응답 확인 후 정의하고 앱/신규회원/쿠폰 조건이 불명확하면 무조건적인 딜로 게시하지 않는다. 응답 invalid/빈 상품/잘못된 통화/생성 링크 실패면 게시를 중단한다.

가격 DB 연결이 이미 준비돼 있다면 `upsertProduct → beginCollectionRun → recordPriceObservation → finishCollectionRun`을 작은 adapter로 재사용한다. DB가 준비되지 않았다면 첫 publish 검증을 위해 shared DB migration부터 요구하지 말고 안전한 로컬 run record로 시작한다. 다만 이는 DB history 저장을 검증한 것으로 보고하지 않는다.

AI 생성은 추후 교체 가능한 `ContentProvider` interface + 템플릿 구현만 둔다. OpenAI/Claude SDK/key/호출은 넣지 않는다. discovery, 7일 baseline, image/card, Instagram, scheduler 복구, 웹 UI, 추천·성과 알고리즘은 첫 게시 이후 별도 단계다.

## RISKS

- Affiliate 권한/empty response/상품 품절/가격 조건이 첫 source gate다. 인증 probe 성공만으로 모든 method 접근을 보장하지 않는다.
- 할인율은 source original price 기준일 수 있어 역사적 하락과 다르다. SKU/배송/세금/신규회원 조건을 배제한 최종 결제가라고 표현하지 않는다.
- 기존 collector는 개별 상품 실패를 results에 담아도 run을 `succeeded`로 종료할 수 있다. 0개 정상 수집이나 부분 실패를 workflow green만으로 성공으로 판단하면 안 된다.
- 일별 dedup은 조회 기준이고 동시실행 DB uniqueness가 없다. 기준 day는 DB session timezone, report day는 Asia/Seoul이라 일 경계 차이가 가능하다. MVP 단일 실행에선 범위를 고정하고 대량 수집 개선은 미룬다.
- publish 응답 timeout 후 무조건 retry하면 중복 게시될 수 있다. container/post 결과를 기록하고 애매한 publish 결과는 reconcile 전 재게시하지 않는다.
- 기존 probe/audit는 raw response/HTML을 ignored reports에 저장한다. ignored는 안전한 공유를 보장하지 않으므로 MVP output은 필요한 public field와 safe errors로 제한한다. token/서명/전체 headers/DB URL을 출력하지 않는다.
- scheduled workflow failure의 정확한 원인과 operational DB 현황은 이번 audit에서 UNKNOWN이다. 기존 workflow를 켜거나 고친 것으로 표현하지 않는다.

## REQUIRED_USER_ACTIONS

1. 테스트할 상품 URL 또는 ID 1개를 선택한다.
2. 본인 AliExpress Affiliate 계정의 승인된 app, AppKey/AppSecret/Tracking ID 및 상세/링크 method 접근 가능 여부를 확인한다. credential은 로컬 ignored env 또는 secret manager에 넣고 채팅/Git에 보내지 않는다.
3. 게시할 Threads 계정과 Meta developer app의 Threads use case를 준비하고, 해당 계정의 유효 user token 및 publishing scopes를 안전하게 설정한다. OAuth를 직접 구현한다면 redirect URI/app credential도 필요하다. test user 접근 조건을 dashboard에서 확인한다.
4. 첫 테스트 글을 공개 게시할 계정을 선택하고 해당 1회 게시를 승인한다. 현재 요청은 audit이므로 게시하지 않았다.
5. 기존 DB history 저장까지 함께 검증하려면 개발용 PostgreSQL 연결을 준비한다. 첫 TEXT 게시만 목표라면 operational/shared DB credential은 선행 요구하지 않는다.

## NEXT_IMPLEMENTATION_PHASE

**Single Product → Threads Text Post MVP**.

제안 파일: `src/aliexpress/affiliate-link.ts`, `src/content/provider.ts` 및 template 구현, `src/threads/client.ts`, `src/commands/post-one-product.ts`, 최소 private run ledger와 mock tests. 기존 `client.ts`에는 필요한 method wrapper/응답 검증만 추가하고 existing discovery/history commands를 유지한다. 제안 command는 `npm run threads:post-one -- --product-id <id>` (기본 dry-run), 실제 게시 시에만 `--publish`를 명시한다. 이는 아직 존재하는 command가 아니다.

완료 기준: 실제 상품1/검증 가격·할인 조건/유효 Affiliate URL/한국어 text/실제 Threads post ID·permalink 1건/같은 실행 재시도 중복 방지/기존15 tests 및 typecheck 유지. credentials 미준비 시 mock/dry-run 성공을 실제 게시 성공으로 승격하지 않는다. 이번 audit 종료 후 이 좁은 phase를 진행하는 것이 가장 빠르다.
