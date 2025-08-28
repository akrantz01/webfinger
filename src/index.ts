/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const OIDC_ISSUER_REL = "http://openid.net/specs/connect/1.0/issuer";

interface Link {
	rel: string;
	href: string;
}

interface Resource {
	scheme: string;
	name: string;
}

function parseResource(raw: string): Resource {
	const resource = new URL(raw);
	return {
		scheme: resource.protocol.slice(0, -1),
		name: resource.hostname || resource.pathname
	}
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const url = new URL(request.url);
		if (url.pathname !== "/.well-known/webfinger") return Response.json({}, { status: 404 });
		if (!url.searchParams.has("resource")) return Response.json({ error: "missing resource" }, { status: 400 });

		const resource = parseResource(url.searchParams.get("resource")!);
		if (resource.scheme !== "acct") return Response.json({}, { status: 404 });
		if (!resource.name.endsWith("@" + url.hostname)) return Response.json({}, { status: 404 });

		const links: Link[] = [];

		const rels = url.searchParams.getAll("rel");
		if (rels.length === 0 || rels.includes(OIDC_ISSUER_REL)) {
			links.push({ rel: OIDC_ISSUER_REL, href: env.OIDC_ISSUER_URL })
		}

		return Response.json({ subject: `${resource.scheme}:${resource.name}`, links }, {
			status: 200,
			headers: { 'Content-Type': 'application/jrd+json' }
		});
	},
} satisfies ExportedHandler<Env>;
