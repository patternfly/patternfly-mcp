import toolkit from '@cdcabrera/eslint-config-toolkit';
import tseslint from 'typescript-eslint';

export default [
  // Ignore patterns, config toolkit ignores gitignored files by default
  {
    ignores: [
      '*.d.ts'
    ]
  },

  ...toolkit.node,
  ...toolkit.jest,

  // Reset toolkit, TypeScript handles these
  {
    files: ['**/*.ts'],
    rules: {
      'no-unused-vars': 0,
      'no-undef': 0,
      'import/no-unresolved': 0,
      'jsdoc/require-returns': 0,
      'jsdoc/require-param-type': 0
    }
  },

  // Eslint config
  {
    files: ['*.js', '*.cjs', '*.mjs'],
    rules: {
      'import/no-unresolved': 'off'
    }
  },

  // Add TypeScript configuration
  ...tseslint.configs.recommended,

  // Src files
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        ecmaVersion: 'latest',
        sourceType: 'module'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 1,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'n/no-process-exit': 0,
      'no-console': 0
    }
  },

  // Test files
  {
    files: ['**/*.test.ts'],
    rules: {
      'no-sparse-arrays': 0
    }
  }
];
