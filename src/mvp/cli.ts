import 'dotenv/config';
import path from 'node:path';
import { mkdir, lstat, open, realpath } from 'node:fs/promises';
import { constants } from 'node:fs';
import { parseArgs } from 'node:util';
import { loadAffiliateConfig } from '../config.js';
import { AliExpressAffiliateClient } from '../aliexpress/client.js';
import { prepareDraft } from './prepare.js';
import { makeDraft, readDraft } from './draft.js';
import { projectProduct } from './product.js';
import { KoreanTemplateProvider } from './content.js';
import { publishDraft } from './ledger.js';
import { ThreadsClient } from './threads.js';
const { values, positionals } = parseArgs({ allowPositionals: true, options: { 'product-id': { type: 'string' }, draft: { type: 'string' }, 'approve-hash': { type: 'string' }, publish: { type: 'boolean', default: false } } });
const [command] = positionals;
const artifactRoot = path.resolve('reports/threads-mvp');
async function privateRoot() { await mkdir(artifactRoot, { recursive: true, mode: 0o700 }); const s = await lstat(artifactRoot); if (s.isSymbolicLink() || !s.isDirectory() || (process.platform !== 'win32' && (s.mode & 0o077) !== 0))
    throw new Error('PRIVATE_ARTIFACT_DIRECTORY_REQUIRED'); return realpath(artifactRoot); }
function required(name: string) { const value = process.env[name]; if (!value?.trim())
    throw new Error(`MISSING_${name}`); return value; }
async function main() {
    if (command === 'check') {
        const names = ['ALIEXPRESS_APP_KEY', 'ALIEXPRESS_APP_SECRET', 'ALIEXPRESS_TRACKING_ID', 'THREADS_USER_ID', 'THREADS_ACCESS_TOKEN'];
        console.log(JSON.stringify({ credentials: Object.fromEntries(names.map(n => [n, Boolean(process.env[n]?.trim())])), databaseRequired: false, liveApiCalled: false, posted: false }, null, 2));
        return;
    }
    if (command === 'prepare' || command === 'demo') {
        if (values.publish)
            throw new Error('PREPARE_CANNOT_PUBLISH');
        let d;
        if (command === 'demo') {
            const product = projectProduct([{ product_id: '1005000000000', product_title: '테스트 상품 (합성 데이터)', target_sale_price: '12.50', target_sale_price_currency: 'USD' }], '1005000000000', 'USD');
            const link = 'https://s.click.aliexpress.com/e/SYNTHETIC';
            d = makeDraft(product, link, await new KoreanTemplateProvider().generate(product, link), 'FIXTURE');
        }
        else {
            if (!values['product-id'])
                throw new Error('PRODUCT_ID_REQUIRED');
            const cfg = loadAffiliateConfig();
            // Never send account secrets to a custom/untrusted API endpoint.
            if (cfg.ALIEXPRESS_API_URL !== 'https://eco.taobao.com/router/rest')
                throw new Error('OFFICIAL_API_ENDPOINT_REQUIRED');
            const client = new AliExpressAffiliateClient({ apiUrl: cfg.ALIEXPRESS_API_URL, appKey: cfg.ALIEXPRESS_APP_KEY, appSecret: cfg.ALIEXPRESS_APP_SECRET, trackingId: cfg.ALIEXPRESS_TRACKING_ID });
            d = await prepareDraft(client, values['product-id'], { country: cfg.ALIEXPRESS_COUNTRY, currency: cfg.ALIEXPRESS_CURRENCY, language: cfg.ALIEXPRESS_LANGUAGE });
        }
        const root = await privateRoot();
        const destination = path.join(root, `${d.origin.toLowerCase()}-${Date.now()}-${d.contentHash.slice(0, 12)}.json`);
        const h = await open(destination, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
        try {
            await h.writeFile(JSON.stringify(d, null, 2) + '\n');
            await h.sync();
        }
        finally {
            await h.close();
        }
        console.log(JSON.stringify({ status: 'DRAFT_READY', origin: d.origin, draft: destination, contentHash: d.contentHash, posted: false }, null, 2));
        return;
    }
    if (command === 'publish') {
        if (!values.publish || !values.draft || !values['approve-hash'])
            throw new Error('EXPLICIT_PUBLISH_DRAFT_AND_APPROVED_HASH_REQUIRED');
        const root = await privateRoot(), filename = path.resolve(values.draft);
        if (path.dirname(filename) !== root)
            throw new Error('DRAFT_OUTSIDE_PRIVATE_DIRECTORY');
        const h = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
        let raw: string;
        try {
            if ((await h.stat()).size > 20000)
                throw new Error('DRAFT_TOO_LARGE');
            raw = await h.readFile('utf8');
        }
        finally {
            await h.close();
        }
        const d = readDraft(JSON.parse(raw));
        if (d.origin !== "LIVE_API")
            throw new Error("FIXTURE_PUBLISH_FORBIDDEN");
        if (d.contentHash !== values['approve-hash'])
            throw new Error("APPROVED_HASH_REQUIRED");
        const userId = required('THREADS_USER_ID'), client = new ThreadsClient(userId, required('THREADS_ACCESS_TOKEN'));
        console.log(JSON.stringify(await publishDraft(d, client, path.join(root, 'ledger'), userId, values['approve-hash'])));
        return;
    }
    throw new Error('USE_check_demo_prepare_OR_publish');
}
main().catch(error => {
    const message = error instanceof Error ? error.message : '';
    // No API body, headers, credentials, Zod input or file contents are printed on failure.
    console.error(/^[A-Z][A-Z0-9_]+$/.test(message) ? message : 'MVP_FAILED_NO_PRIVATE_DETAILS');
    process.exitCode = 1;
});
