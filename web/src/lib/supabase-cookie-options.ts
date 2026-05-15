/** HTTP LAN dev (e.g. phone → http://192.168.x.x:3000) requires non-secure cookies. */
export const supabaseCookieOptions = {
  path: "/" as const,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};
