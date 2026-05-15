/**
 * Origin for redirects and absolute URLs. Prefer Host / forwarded headers over
 * `new URL(request.url).origin` so LAN testing (http://192.168.x.x:3000) does not
 * redirect to localhost after OAuth.
 */
export function getRequestSiteOrigin(request: Request): string {
  const url = new URL(request.url);
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ??
    request.headers.get("host") ??
    url.host;
  const forwardedProto = request.headers
    .get("x-forwarded-proto")
    ?.split(",")[0]
    ?.trim();
  const proto =
    forwardedProto === "http" || forwardedProto === "https"
      ? forwardedProto
      : url.protocol.replace(":", "") || "http";
  return `${proto}://${host}`;
}
