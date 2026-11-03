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
    // Serwist が生成する Service Worker
    "public/sw.js",
    // DB スキーマの検証スクリプト。アプリのコードではなく単体で動く Node スクリプト
    "supabase/tests/**",
  ]),
]);

export default eslintConfig;
