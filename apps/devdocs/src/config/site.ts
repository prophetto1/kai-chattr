// Public site URLs, baked in at build time. Values come from per-environment
// GitHub Environment variables (production / preview). Local dev sets them in
// the `dev` script. Fallback is the local dev port so a misconfigured build
// surfaces an obvious dev-machine link rather than a broken prod host.
export const SITE_NAME = 'kai · chattr docs'
export const SITE_TAGLINE =
  'Governance and architecture for the kai-chattr coordination room.'
export const DOCS_URL =
  process.env.NEXT_PUBLIC_DOCS_URL ?? 'http://localhost:8370'
export const KAI_CHATTR_WEB_URL =
  process.env.NEXT_PUBLIC_KAI_CHATTR_WEB_URL ?? 'http://localhost:8360'
