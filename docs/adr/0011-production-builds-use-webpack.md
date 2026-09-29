# 11. Production builds use webpack, not Turbopack

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

Next 16 builds with Turbopack by default, and the deploy on Hostinger's Node
runner failed there:

```
Error [TurbopackInternalError]: Failed to write app endpoint /sitemap.xml/route
- [project]/app/globals.css [app-client] (css)
- node process exited before we could connect to it with exit status: 0
```

Turbopack does not run webpack loaders or PostCSS itself. It starts a pool of
`node` worker processes (`pool_entry-[turbopack-node]_transforms_postcss…`),
passes each a port on its command line, and waits for the worker to connect
back over TCP to `127.0.0.1:<port>`. The worker exits with status 0 when that
socket closes. "Exited before we could connect, status 0, no output" is
therefore the signature of a worker that could not reach the build process
over loopback.

Tailwind v4 is a PostCSS plugin (`@tailwindcss/postcss`), and `app/globals.css`
goes through it. So on a runner where that connection fails, every build
fails at the first stylesheet, whichever route happens to be written first.

This was reproduced locally by making loopback connects fail for `node`
processes, which gave the same error on the same endpoint. The same build with
`next build --webpack` succeeded under the same conditions.

## Decision

`npm run build` is `next build --webpack`.

Webpack runs PostCSS in-process, in the build worker, through `postcss-loader`.
Next's own build and prerender workers are forked from the Node binary already
running the build and talk to it over IPC pipes, so nothing in the build needs
a loopback TCP connection between processes.

`next dev` stays on Turbopack. Development does not run on the host, and its
speed is what Turbopack is for.

CI runs the same `npm run build`, so what CI verifies is what the host builds.

## Consequences

- Production builds are slower than with Turbopack; about 80 seconds locally.
- Development and production use different bundlers. A difference that only
  one of them shows will surface in CI or on the host, not in `next dev`.
- `turbopack.root` in `next.config.ts` still matters: Next applies it as
  `outputFileTracingRoot`, which pins the standalone trace of this build.
- Revisit when Hostinger's runner can run Turbopack's worker pool, or when
  Turbopack can run PostCSS without it. To check: temporarily switch the build
  script back to `next build` and deploy it.
