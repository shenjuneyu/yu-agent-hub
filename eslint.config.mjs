import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'coverage/**',
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
    ],
  },

  // Base JS recommended
  js.configs.recommended,

  // Base JS rule overrides (project-wide)
  {
    rules: {
      // Terminal/ANSI processing code intentionally uses control characters in regex
      'no-control-regex': 'off',
      // prefer-const is covered by TypeScript compiler; avoid duplicate errors
      'prefer-const': 'warn',
      // Pattern of assigning then immediately reassigning is present in existing code
      'no-useless-assignment': 'warn',
    },
  },

  // TypeScript files
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.recommended,
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      // Keep as warn only — TypeScript compiler already enforces this
      'prefer-const': 'warn',
    },
  },

  // Vue SFC files (includes embedded TS)
  {
    files: ['**/*.vue'],
    extends: [
      ...tseslint.configs.recommended,
      ...pluginVue.configs['flat/recommended'],
    ],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-require-imports': 'warn',
      // Vue-specific relaxations
      'vue/multi-word-component-names': 'warn',
      'vue/no-v-html': 'warn',
    },
  },

  // Disable all rules that conflict with Prettier (must be last)
  prettierConfig,
);
