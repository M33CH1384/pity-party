/** CORS allow-list. Fails closed: no ALLOWED_ORIGINS means only the Worker's own origin and
 *  pity-party.pages.dev preview deployments (<hash>.pity-party.pages.dev) are allowed. No '*'. */
export function allowedOrigin(req: Request, env: { ALLOWED_ORIGINS?: string }): string | null {
  const origin = req.headers.get('Origin');
  if (!origin) return null;
  // the Worker's own pages (feedback admin sign-in form)
  if (origin === new URL(req.url).origin) return origin;
  const list = (env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter((s) => s && s !== '*');
  if (list.includes(origin)) return origin;
  // preview deployments of the Pages project: <hash>.pity-party.pages.dev
  if (/^https:\/\/[a-z0-9-]+\.pity-party\.pages\.dev$/.test(origin)) return origin;
  return null;
}
