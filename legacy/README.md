# Legacy demo

`demo/` is the earlier prototype of SEO-GEO (a single Next.js app with Prisma). It is kept
unchanged for reference while the new monorepo reaches feature parity, and is **not** part of
the pnpm workspace, the build or CI.

Do not deploy it: the review in
[docs/audit/2026-09-demo-audit.md](../docs/audit/2026-09-demo-audit.md) lists security issues
(including SSRF and an OAuth state flaw) that are fixed only in the new code. The folder will be
removed once the new application replaces it.
