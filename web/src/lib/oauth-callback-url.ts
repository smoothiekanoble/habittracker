/**
 * URL sent to Supabase as redirectTo for OAuth. If the browser never opens
 * `http://<LAN_IP>:3000/auth/callback`, the dev server will not log a GET.
 *
 * Set NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN=http://192.168.x.x:3000 in web/.env.local
 * (same value in Supabase → Authentication → Redirect URLs and ideally Site URL while testing).
 */
export function getOAuthCallbackUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim().replace(/\/$/, "");
  if (fromEnv) return `${fromEnv}/auth/callback`;
  if (typeof window === "undefined") {
    return "/auth/callback";
  }
  return `${window.location.origin}/auth/callback`;
}
