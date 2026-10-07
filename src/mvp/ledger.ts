import { open, mkdir, lstat, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { hash, readDraft, type Draft } from "./draft.js";
import type { ThreadsPublisher } from "./threads.js";
// Standardized failures/timeouts are persisted as UNKNOWN, never auto-retried.
export async function publishDraft(draft: Draft, publisher: ThreadsPublisher, directory: string, userId: string, approvedHash: string, now = Date.now()) {
    if (process.platform === "win32")
        throw new Error("WINDOWS_PUBLISH_REQUIRES_PRIVATE_ACL_VERIFICATION");
    const d = readDraft(draft);
    if (d.origin !== "LIVE_API")
        throw new Error("FIXTURE_PUBLISH_FORBIDDEN");
    if (approvedHash !== d.contentHash || !/^\d+$/.test(userId))
        throw new Error("APPROVED_HASH_REQUIRED");
    const age = now - Date.parse(d.product.observedAt);
    if (age < 0 || age > 24 * 60 * 60 * 1000)
        throw new Error("DRAFT_STALE");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stat = await lstat(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0)
        throw new Error("PRIVATE_LEDGER_DIRECTORY_REQUIRED");
    const base = await realpath(directory);
    // One attempt per account+product, irrespective of a changed title/link/text.
    const key = hash(`${userId}:${d.product.productId}`);
    let handle;
    try {
        handle = await open(path.join(base, `${key}.jsonl`), constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    }
    catch (error) {
        if (error && typeof error === "object" && "code" in error && error.code === "EEXIST")
            throw new Error("DUPLICATE_PRODUCT_ATTEMPT_BLOCKED");
        throw error;
    }
    const record = async (state: string, ids: Record<string, string> = {}) => { await handle.writeFile(JSON.stringify({ state, at: new Date().toISOString(), productId: d.product.productId, contentHash: d.contentHash, ...ids }) + "\n"); await handle.sync(); };
    try {
        await record("STARTED");
        let containerId: string;
        try {
            containerId = await publisher.create(d.text);
            if (!/^\d+$/.test(containerId))
                throw new Error("INVALID_CONTAINER_ID");
        }
        catch {
            await record("CREATE_UNKNOWN");
            throw new Error("CREATE_UNKNOWN_MANUAL_RECONCILIATION_REQUIRED");
        }
        await record("CONTAINER_CREATED", { containerId });
        await record("PUBLISH_STARTED", { containerId });
        let postId: string;
        try {
            postId = await publisher.publish(containerId);
            if (!/^\d+$/.test(postId))
                throw new Error("INVALID_POST_ID");
        }
        catch {
            await record("PUBLISH_UNKNOWN", { containerId });
            throw new Error("PUBLISH_UNKNOWN_MANUAL_RECONCILIATION_REQUIRED");
        }
        await record("PUBLISHED", { containerId, postId });
        return { postId, containerId };
    }
    finally {
        await handle.close();
    }
}
