import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';
import type { ResponseBody } from '../src/types';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

interface RequestInput {
	hostname?: string;
	path?: string;
	params?: Record<string, string | string[]>;
}

async function makeRequest(input: RequestInput): Promise<Response> {
	const hostname = input.hostname || "example.com";
	const path = input.path || "/.well-known/webfinger";
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(input.params || {})) {
		if (Array.isArray(value)) {
			for (const v of value) {
				params.append(key, v);
			}
		} else {
			params.append(key, value);
		}
	}
	const url = `https://${hostname}${path}?${params.toString()}`;
	const request = new IncomingRequest(url);

	const ctx = createExecutionContext();
	const response = await worker.fetch(request as any, env, ctx);
	await waitOnExecutionContext(ctx);

	return response;
}

describe("webfinger worker", () => {
	describe("with different path", () => {
		it("responds with 404", async () => {
			const response = await makeRequest({ path: "/invalid-path" });
			expect(response.status).toBe(404);
		});
	});

	describe("without query parameters", () => {
		it("responds with 400", async () => {
			const response = await makeRequest({});
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ error: "missing resource" });
		});
	});

	describe("with resource query parameter", () => {
		describe("with invalid scheme", () => {
			it("responds with 404", async () => {
				const response = await makeRequest({ params: { resource: "http://example.com" } });
				expect(response.status).toBe(404);
			});
		});

		describe("with mismatched hostname", () => {
			it("responds with 404", async () => {
				const response = await makeRequest({ params: { resource: "acct:user@other.com" } });
				expect(response.status).toBe(404);
			});
		});

		describe("with valid resource", () => {
			it("responds with 200", async () => {
				const response = await makeRequest({ params: { resource: "acct:user@example.com" } });
				expect(response.status).toBe(200);
			});

			it("responds with application/jrd+json content type", async () => {
				const response = await makeRequest({ params: { resource: "acct:user@example.com" } });
				expect(response.headers.get("Content-Type")).toBe("application/jrd+json");
			});

			it("responds with all links", async () => {
				const response = await makeRequest({ params: { resource: "acct:user@example.com" } });
				const body: ResponseBody = (await response.json());
				expect(body.links).toEqual([
					{ rel: "http://openid.net/specs/connect/1.0/issuer", href: env.OIDC_ISSUER_URL }
				]);
			});
		});
	});

	describe("with valid resource and rel query parameter", () => {
		describe("with oidc issuer type", () => {
			it("responds with only oidc issuer link", async () => {
				const response = await makeRequest({ params: { resource: "acct:user@example.com", rel: "http://openid.net/specs/connect/1.0/issuer" } });
				const body: ResponseBody = (await response.json());
				expect(body.links).toEqual([
					{ rel: "http://openid.net/specs/connect/1.0/issuer", href: env.OIDC_ISSUER_URL }
				]);
			});
		});

		describe("with unknown types", () => {
			it("responds with no links", async () => {
				const response = await makeRequest({ params: { resource: "acct:user@example.com", rel: "unknown" } });
				const body: ResponseBody = (await response.json());
				expect(body.links).toEqual([]);
			});

			describe("and oidc issuer type", () => {
				it("responds with only oidc issuer link", async () => {
					const response = await makeRequest({ params: { resource: "acct:user@example.com", rel: ["unknown", "http://openid.net/specs/connect/1.0/issuer"] } });
					const body: ResponseBody = (await response.json());
					expect(body.links).toEqual([
						{ rel: "http://openid.net/specs/connect/1.0/issuer", href: env.OIDC_ISSUER_URL }
					]);
				});
			});
		});
	});
});
