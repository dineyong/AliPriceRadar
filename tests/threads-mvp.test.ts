import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtemp, readFile, readdir, rm, stat, mkdir, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { projectProduct, extractAffiliateLink, affiliateUrl } from '../src/mvp/product.js';
import { KoreanTemplateProvider, validateText } from '../src/mvp/content.js';
import { makeDraft, readDraft, hash } from '../src/mvp/draft.js';
import { ThreadsClient } from '../src/mvp/threads.js';
import { publishDraft } from '../src/mvp/ledger.js';
import { prepareDraft } from '../src/mvp/prepare.js';
import { AliExpressAffiliateClient } from '../src/aliexpress/client.js';
const id = '1005000000000', source = `https://www.aliexpress.com/item/${id}.html`, link = 'https://s.click.aliexpress.com/e/DEMO';
const p = { product_id: id, product_title: '테스트 상품', target_sale_price: '12.50', target_sale_price_currency: 'USD' };
const roots: string[] = [];
const cfg = { apiUrl: 'https://eco.taobao.com/router/rest', appKey: 'test-app', appSecret: 'test-secret', trackingId: 'test-tracking' };
async function draft(origin: 'LIVE_API' | 'FIXTURE' = 'LIVE_API') { const product = projectProduct([p], id, 'USD'); return makeDraft(product, link, await new KoreanTemplateProvider().generate(product, link), origin); }
async function root() { const value = await mkdtemp(path.join(os.tmpdir(), 'radar-mvp-')); roots.push(value); return value; }
const result = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const detailBody = { aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 200, result: { products: { product: [p] } } } } };
const linkBody = { aliexpress_affiliate_link_generate_response: { resp_result: { resp_code: 200, result: { promotion_links: { promotion_link: [{ source_value: source, promotion_link: link }] } } } } };
afterEach(async () => { vi.unstubAllGlobals(); for (const d of roots.splice(0))
    await rm(d, { recursive: true, force: true }); });
describe('projection and factual draft', () => {
    it('keeps price/currency pair and canonical product URL', () => { expect(projectProduct([p], id, 'USD')).toMatchObject({ price: '12.50', currency: 'USD', productUrl: source }); });
    it.each([{ ...p, target_sale_price_currency: 'KRW' }, { ...p, target_sale_price: '0' }, { ...p, target_sale_price: '-4' }, { ...p, target_sale_price: '12,50' }, { ...p, target_sale_price: '9'.repeat(400) }])('rejects invalid or mismatched price', row => expect(() => projectProduct([row], id, 'USD')).toThrow());
    it('preserves only bounded source discount metadata without inventing historical drops', () => { expect(projectProduct([{ ...p, discount: '15%' }], id, 'USD').sourceReportedDiscount).toBe('15%'); expect(projectProduct([{ ...p, discount: 'secret-token' }], id, 'USD').sourceReportedDiscount).toBeNull(); });
    it('does not substitute app-only price', () => expect(() => projectProduct([{ product_id: id, product_title: 'title', app_sale_price: '1', app_sale_price_currency: 'USD' }], id, 'USD')).toThrow());
    it('rejects duplicate product identities', () => expect(() => projectProduct([p, p], id, 'USD')).toThrow());
    it.each(['https://evil.example/e/DEMO', 'https://s.click.aliexpress.com.evil.example/e/DEMO', 'https://x@s.click.aliexpress.com/e/DEMO', 'https://s.click.aliexpress.com/e/DEMO?token=secret'])('rejects untrusted affiliate URL', url => expect(() => affiliateUrl(url)).toThrow());
    it('requires exact link source and business success', () => {
        expect(extractAffiliateLink(linkBody, source)).toBe(link);
        expect(() => extractAffiliateLink(linkBody, source + '1')).toThrow();
        expect(() => extractAffiliateLink({}, source)).toThrow();
    });
    it('generates disclosed Korean template within limit without discount claims', async () => { const d = await draft(); expect(d.text).toContain('12.50 USD'); expect(d.text).toContain('제휴 링크'); expect(d.text).not.toMatch(/최저가|역대|가격 하락/); expect([...d.text].length).toBeLessThanOrEqual(500); });
    it('counts Unicode characters and rejects >500', () => { expect(() => validateText('😀'.repeat(500))).not.toThrow(); expect(() => validateText('😀'.repeat(501))).toThrow(); });
    it('rejects edited draft and missing disclosure', async () => { const d = await draft(); expect(() => readDraft({ ...d, text: d.text + '!' })).toThrow(); const text = d.text.replace('제휴 링크', '링크'); expect(() => readDraft({ ...d, text, contentHash: hash(text) })).toThrow(); });
    it('prepares using existing detail client then exact official link method', async () => {
        const request = vi.fn().mockResolvedValueOnce(result(detailBody)).mockResolvedValueOnce(result(linkBody));
        vi.stubGlobal('fetch', request);
        const d = await prepareDraft(new AliExpressAffiliateClient(cfg), id, { country: 'KR', currency: 'USD', language: 'KO' });
        expect(d.origin).toBe('LIVE_API');
        expect(d.product.price).toBe('12.50');
        expect(request).toHaveBeenCalledTimes(2);
        const first = request.mock.calls[0]![1].body as URLSearchParams, second = request.mock.calls[1]![1].body as URLSearchParams;
        expect(first.get('country')).toBe('KR');
        expect(second.get('method')).toBe('aliexpress.affiliate.link.generate');
        expect(second.get('source_values')).toBe(source);
        expect(second.get('tracking_id')).toBe(cfg.trackingId);
    });
    it('does not request link on invalid business result', async () => { const request = vi.fn().mockResolvedValue(result({ aliexpress_affiliate_productdetail_get_response: { resp_result: { resp_code: 500, result: { products: { product: [p] } } } } })); vi.stubGlobal('fetch', request); await expect(prepareDraft(new AliExpressAffiliateClient(cfg), id, { country: 'KR', currency: 'USD', language: 'KO' })).rejects.toThrow('PRODUCT_BUSINESS_ERROR'); expect(request).toHaveBeenCalledTimes(1); });
    it('does not expose API body on error', async () => { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(result({ error_response: { msg: 'secret-private-value' } }, 400))); await expect(new AliExpressAffiliateClient(cfg).call('test', {})).rejects.toThrow('ALIEXPRESS_API_ERROR_HTTP_400'); });
});
describe('Threads protocol and publication ledger', () => {
    it('creates and publishes in two steps with bearer auth, no token URL or auto-publish', async () => {
        const request = vi.fn().mockResolvedValueOnce(result({ id: '123' })).mockResolvedValueOnce(result({ id: '100' })).mockResolvedValueOnce(result({ id: '200' }));
        const c = new ThreadsClient('123', 'test-token', request);
        expect(await c.create('hello')).toBe('100');
        expect(await c.publish('100')).toBe('200');
        expect(request.mock.calls[1]![0]).toBe('https://graph.threads.net/v1.0/123/threads');
        const options = request.mock.calls[1]![1];
        expect(options.headers.Authorization).toBe('Bearer test-token');
        expect(options.body.get('auto_publish_text')).toBeNull();
        expect(options.redirect).toBe('error');
        expect(request.mock.calls[2]![1].body.get('creation_id')).toBe('100');
    });
    it('sanitizes create/publish response errors after verifying account', async () => { const req = vi.fn().mockResolvedValueOnce(result({ id: '123' })).mockResolvedValueOnce(result({ error: { message: 'private-secret' } }, 500)).mockResolvedValueOnce(result({ error: { message: 'private-secret' } }, 500)); const c = new ThreadsClient('123', 'token', req); await expect(c.create('text')).rejects.toThrow('THREADS_CREATE_UNCONFIRMED'); await expect(c.publish('100')).rejects.toThrow('THREADS_PUBLISH_UNCONFIRMED'); expect(req).toHaveBeenCalledTimes(3); });
    it('refuses a token bound to a different account before any POST', async () => { const req = vi.fn().mockResolvedValue(result({ id: '999' })); await expect(new ThreadsClient('123', 'token', req).create('text')).rejects.toThrow('THREADS_ACCOUNT_UNCONFIRMED'); expect(req).toHaveBeenCalledTimes(1); expect(req.mock.calls[0]![1].method).toBeUndefined(); });
    it('sanitizes remote errors and never retries', async () => { const req = vi.fn().mockResolvedValue(result({ error: { message: 'private secret' } }, 400)); await expect(new ThreadsClient('1', 'token', req).create('text')).rejects.toThrow('THREADS_ACCOUNT_UNCONFIRMED'); expect(req).toHaveBeenCalledTimes(1); });
    it('persists success and refuses duplicate regardless of changed text', async () => {
        const d = await draft(), directory = await root(), publisher = { create: vi.fn().mockResolvedValue('100'), publish: vi.fn().mockResolvedValue('200') };
        expect(await publishDraft(d, publisher, directory, '123', d.contentHash)).toEqual({ containerId: '100', postId: '200' });
        const text = d.text + '!';
        await expect(publishDraft({ ...d, text, contentHash: hash(text) }, publisher, directory, '123', hash(text))).rejects.toThrow();
        expect(publisher.create).toHaveBeenCalledTimes(1);
        const f = path.join(directory, (await readdir(directory))[0]!);
        const records = (await readFile(f, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        expect(records.map(r => r.state)).toEqual(['STARTED', 'CONTAINER_CREATED', 'PUBLISH_STARTED', 'PUBLISHED']);
        expect((await stat(f)).mode & 0o777).toBe(0o600);
    });
    it('concurrent attempts cannot double publish', async () => { const d = await draft(), directory = await root(), publisher = { create: vi.fn().mockResolvedValue('100'), publish: vi.fn().mockResolvedValue('200') }; const r = await Promise.allSettled([publishDraft(d, publisher, directory, '123', d.contentHash), publishDraft(d, publisher, directory, '123', d.contentHash)]); expect(r.filter(x => x.status === 'fulfilled')).toHaveLength(1); expect(publisher.publish).toHaveBeenCalledTimes(1); });
    it.each(['create', 'publish'] as const)('retains ambiguous %s and blocks automatic retry', async (failing) => {
        const d = await draft(), directory = await root(), publisher = { create: vi.fn().mockResolvedValue('100'), publish: vi.fn().mockResolvedValue('200') };
        publisher[failing].mockRejectedValue(new Error('timeout with private details'));
        await expect(publishDraft(d, publisher, directory, '123', d.contentHash)).rejects.toThrow('UNKNOWN');
        await expect(publishDraft(d, publisher, directory, '123', d.contentHash)).rejects.toThrow();
        expect(publisher.create).toHaveBeenCalledTimes(1);
        const text = await readFile(path.join(directory, (await readdir(directory))[0]!), 'utf8');
        expect(text).toContain(failing === 'create' ? 'CREATE_UNKNOWN' : 'PUBLISH_UNKNOWN');
        expect(text).not.toContain('private details');
    });
    it('requires approved hash, rejects stale/future draft and synthetic publication', async () => {
        const d = await draft(), directory = await root(), publisher = { create: vi.fn(), publish: vi.fn() };
        await expect(publishDraft(d, publisher, directory, '123', '0'.repeat(64))).rejects.toThrow('APPROVED_HASH');
        await expect(publishDraft(d, publisher, directory, '123', d.contentHash, Date.parse(d.product.observedAt) + 86400001)).rejects.toThrow('STALE');
        await expect(publishDraft(d, publisher, directory, '123', d.contentHash, Date.parse(d.product.observedAt) - 1)).rejects.toThrow('STALE');
        await expect(publishDraft({ ...d, origin: 'FIXTURE' }, publisher, directory, '123', d.contentHash)).rejects.toThrow('FIXTURE');
        expect(publisher.create).not.toHaveBeenCalled();
    });
    it('refuses symlink ledger destination', async () => { const d = await draft(), directory = await root(), alias = path.join(directory, 'alias'), dest = path.join(directory, 'dest'); await mkdir(dest, { mode: 0o700 }); await symlink(dest, alias); await expect(publishDraft(d, { create: vi.fn(), publish: vi.fn() }, alias, '123', d.contentHash)).rejects.toThrow('PRIVATE_LEDGER'); });
});
