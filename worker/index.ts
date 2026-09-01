type StaticAssets = { fetch(request: Request): Promise<Response> };
type Environment = { ASSETS: StaticAssets };

/**
 * Cloudflare-compatible SPA entrypoint used by OpenAI Sites. Static assets are
 * served directly; unknown HTML routes fall back to index.html so React Router
 * deep links such as /writing and /report/:runId remain functional.
 */
export default {
  async fetch(request: Request, environment: Environment): Promise<Response> {
    const response = await environment.ASSETS.fetch(request);
    if (response.status !== 404 || request.method !== "GET") return response;

    const acceptsHtml = request.headers.get("accept")?.includes("text/html");
    if (!acceptsHtml) return response;

    const url = new URL(request.url);
    url.pathname = "/index.html";
    url.search = "";
    return environment.ASSETS.fetch(new Request(url, request));
  },
};
