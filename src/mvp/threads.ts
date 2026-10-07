import { validateText } from "./content.js";
export interface ThreadsPublisher {
    create(text: string): Promise<string>;
    publish(containerId: string): Promise<string>;
}
export class ThreadsClient implements ThreadsPublisher {
    constructor(private readonly userId: string, private readonly accessToken: string, private readonly request: typeof fetch = fetch) {
        if (!/^\d+$/.test(userId) || !accessToken.trim() || /[\r\n]/.test(accessToken))
            throw new Error("INVALID_THREADS_CONFIG");
    }
    private async post(path: string, fields: Record<string, string>): Promise<string> {
        try {
            const response = await this.request(`https://graph.threads.net/v1.0/${this.userId}/${path}`, {
                method: "POST", headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams(fields), signal: AbortSignal.timeout(30000), redirect: "error"
            });
            const data: unknown = await response.json();
            if (!response.ok || !data || typeof data !== "object" || "error" in data || !("id" in data) || typeof data.id !== "string" || !/^\d+$/.test(data.id))
                throw new Error("BAD_RESPONSE");
            return data.id;
        }
        catch {
            throw new Error(`THREADS_${path === "threads" ? "CREATE" : "PUBLISH"}_UNCONFIRMED`);
        }
    }
    async create(text: string): Promise<string> {
        validateText(text);
        // Verify token ownership before creating content for the configured account.
        try {
            const response = await this.request("https://graph.threads.net/v1.0/me?fields=id", { headers: { Authorization: `Bearer ${this.accessToken}` }, signal: AbortSignal.timeout(30000), redirect: "error" });
            const value: unknown = await response.json();
            if (!response.ok || !value || typeof value !== "object" || !("id" in value) || value.id !== this.userId)
                throw new Error("MISMATCH");
        }
        catch {
            throw new Error("THREADS_ACCOUNT_UNCONFIRMED");
        }
        return this.post("threads", { media_type: "TEXT", text });
    }
    async publish(containerId: string): Promise<string> {
        if (!/^\d+$/.test(containerId))
            throw new Error("INVALID_CONTAINER_ID");
        return this.post("threads_publish", { creation_id: containerId });
    }
}
