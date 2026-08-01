/**
 * Stands in for Next's `server-only` marker when a script runs outside the bundler.
 *
 * The real thing is `next/dist/compiled/server-only`, resolved by the Next compiler rather
 * than by Node — so `import "server-only"` is unresolvable under plain `tsx`. That guard
 * exists to fail a *client* bundle, and a CLI script is not one, so satisfying it with an
 * empty module loses nothing.
 *
 * Wired in through `tsconfig.scripts.json`, which the app build never reads. Aliasing this
 * in the main tsconfig would disarm the guard everywhere, which is the opposite of the point.
 */
export {};
