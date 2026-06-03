import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Non-shipped dev code — scratch experiments + archived scripts are not
    // production source and should not gate CI on lint rules meant for the app.
    "scratch/**",
    "scripts/**",
    // The V2 Python service has its own (Python) tooling, not ESLint.
    "service/**",
    // Local git worktrees + tool config are not part of the app source.
    ".claude/**",
  ]),
]);

export default eslintConfig;
