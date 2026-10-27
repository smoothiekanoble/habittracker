/**
 * URL sent to Supabase as redirectTo for OAuth. If the browser never opens
 * `http://<LAN_IP>:3000/auth/callback`, the dev server will not log a GET.
 *
 * Set NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN=http://192.168.x.x:3000 in web/.env.local
 * for LAN testing only. Leave it unset in hosted environments so production
 * uses the browser's deployed origin.
 */
export function getOAuthCallbackUrl(): string {
  // The login button runs in the browser, so the current origin is the most
  // reliable target for local LAN testing and deployed previews alike.
  if (typeof window !== "undefined") return `${window.location.origin}/auth/callback`;

  const fromEnv = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim().replace(/\/$/, "");
  return fromEnv ? `${fromEnv}/auth/callback` : "/auth/callback";
}
