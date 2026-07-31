import tseslint from "typescript-eslint";
import next from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";

/**
 * ESLint 10, flat config.
 *
 * `eslint-config-next` 16 ships native flat config arrays, so they're spread
 * directly. The previous `FlatCompat` wrapper is gone: compat-wrapping a config
 * that is *already* flat produces a circular plugin graph and ESLint dies with
 * "Converting circular structure to JSON".
 */
const config = [
  ...next,
  ...coreWebVitals,

  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "public/sw.js",
      // Generated at build time.
      "next-env.d.ts",
    ],
  },

  {
    /**
     * `react-hooks/set-state-in-effect` ships as an *error* in
     * eslint-config-next 16 (React 19's stricter hooks plugin). Its advice is
     * sound in general — derived state belongs in render — and the two genuine
     * instances it caught here were fixed: `leave-form` now derives its end date,
     * and `dialog` uses `useId()` instead of `Math.random()` during render.
     *
     * The remainder are patterns that *require* an effect in a server-rendered
     * app, where the rule has no better alternative to offer:
     *
     *   • `useMounted()` — portals and `document` access must wait for hydration.
     *   • `usePersistentState` / `useMediaQuery` — localStorage and matchMedia
     *     don't exist on the server, so the value cannot be read during the first
     *     render without causing a hydration mismatch.
     *   • `useAnchor` — a popover must measure the DOM before it can position
     *     itself; measurement is only possible after commit.
     *   • `Dialog`/`Sheet` exit animations — the node has to stay mounted for the
     *     duration of the transition after `open` flips to false.
     *   • Toasts fired from a `useActionState` result — the action's outcome is
     *     only observable after the render that carries it.
     *
     * Downgraded to `warn` rather than switched off: new violations should still
     * be visible and argued for, not silently accepted.
     */
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "warn",
    },
  },

  {
    // Flat config namespaces plugins per object, so a config that references
    // `@typescript-eslint/*` rules must declare the plugin itself — inheriting it
    // from an earlier object in the array is not enough.
    files: ["**/*.ts", "**/*.tsx"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
];

export default config;
