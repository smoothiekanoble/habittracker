/**
 * Next.js 15+ passes `params` as a Promise; 14 passes a plain object.
 * `await Promise.resolve(params)` works for both.
 */
export async function resolvedRouteParams<P extends Record<string, string>>(
  params: P | Promise<P>
): Promise<P> {
  return Promise.resolve(params);
}
