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
      curly: [2, 'all'],
      'no-unused-vars': 0,
      'no-undef': 0,
      'import/no-unresolved': 0,
      'jsdoc/require-returns': 0,
      'jsdoc/require-returns-type': 0,
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
      '@typescript-eslint/consistent-type-imports': [
        2,
        {
          prefer: 'type-imports',
          fixStyle: 'inline-type-imports',
          disallowTypeAnnotations: false
        }
      ],
      '@typescript-eslint/consistent-type-exports': [
        2,
        {
          fixMixedExportsWithInlineTypeSpecifier: true
        }
      ],
      '@typescript-eslint/no-explicit-any': 1,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      'n/no-process-exit': 0,
      // Disallow console.log/info in runtime to protect STDIO; allow warn/error
      'no-console': ['error', { allow: ['warn', 'error'] }]
    }
  },

  // Test files
  {
    files: [
      '**/*.test.ts',
      'tests/**/*.ts',
      '**/__tests__/**/*test.ts'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/ban-ts-comment': 1,
      'no-sparse-arrays': 0,
      // Allow console usage in tests (spies, debug)
      'no-console': 0,
      // Relax stylistic padding in tests to reduce churn
      '@stylistic/padding-line-between-statements': 0
    }
  }
];
