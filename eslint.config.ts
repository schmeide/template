import eslint from "@eslint/js";
import pluginVitest from "@vitest/eslint-plugin";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**"] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    files: ["backend/**", "*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    ...reactHooks.configs.flat["recommended-latest"],
    files: ["frontend/**"],
    languageOptions: { globals: globals.browser },
  },
  {
    ...pluginVitest.configs.recommended,
    files: ["**/__tests__/*"],
  }
);
