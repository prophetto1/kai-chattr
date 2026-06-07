# AGENTS.md - apps/web

This app is the clean kai-chattr React/Vite frontend.

## Component foundation

Use the approved component foundation from the start.

- Use shadcn/ui source components for UI primitives in `src/components/ui`.
- Use Vercel AI Elements / AI SDK React source components for AI, chat, prompt, terminal, file-tree,
  code, model, and workbench surfaces.
- Local components may compose approved source components.
- Do not handroll replacement primitives such as local-only `button`, `card`, `badge`, or
  prompt/composer components and describe them as shadcn or Vercel AI patterns.
- Do not copy the legacy `E:/chattr/static` UI. Treat legacy chattr as behavior reference only.

Current violation to remove before extending UI:

- If local-only `src/components/ui/button.tsx`, `card.tsx`, `badge.tsx`, or `prompt-panel.tsx`
  exist as bespoke primitives, treat them as temporary invalid starter code. Replace them with
  approved shadcn/ui and Vercel AI Elements source components before building on them.

Acceptance for any frontend page:

- The component imports prove the page is built from shadcn/ui and, where AI/workbench behavior is
  present, Vercel AI Elements / AI SDK React.
- Any new dependency is present in `governance/contracts/architecture.json` before use.
- `pnpm web:build`, `pnpm check:deps`, and `pnpm check:contracts` pass.
