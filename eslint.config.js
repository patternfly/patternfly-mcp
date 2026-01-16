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
      'import/exports-last': 2,
      'import/group-exports': 1,
      'id-length': ['error', {
        min: 2,
        properties: 'never',
        exceptions: ['a', 'b', 'i', 'j', 'k', '_']
      }],
      'n/no-process-exit': 0,
      // Disallow console.log/info in runtime to protect STDIO; allow warn/error
      'no-console': ['error', { allow: ['warn', 'error'] }],
      // Custom syntax rules
      'no-restricted-syntax': [
        'error',
        {
          // Disallow rest parameters in a property named `keyHash`
          selector:
            "Property[key.name='keyHash'] > :matches(FunctionExpression, ArrowFunctionExpression) > RestElement",
          message:
            'keyHash must accept a single array parameter (args). Do not use rest params (...args).'
        },
        {
          // Also catch when `keyHash` lives in a CallExpression options object (e.g., memo(fn, { keyHash() {} }))
          selector:
            "CallExpression > ObjectExpression > Property[key.name='keyHash'] > :matches(FunctionExpression, ArrowFunctionExpression) > RestElement",
          message:
            'keyHash must accept a single array parameter (args). Do not use rest params (...args).'
        }
      ]
    }
  },
  {
    files: ['src/*.d.ts'],
    rules: {
      'import/group-exports': 0
    }
  },
  {
    files: [
      '**/*.test.ts',
      'tests/**/*.ts',
      '**/__tests__/**/*test.ts'
    ],
    rules: {
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/ban-ts-comment': 0,
      'import/exports-last': 0,
      'import/group-exports': 0,
      'no-sparse-arrays': 0,
      // Allow console usage in tests (spies, debug)
      'no-console': 0
    }
  },
  {
    files: [
      'docs/**/*.ts',
      'docs/**/*.js'
    ],
    rules: {
      'jsdoc/require-returns': 0,
      'jsdoc/require-returns-type': 0,
      'jsdoc/require-param-type': 0,
      'import/no-unresolved': 0,
      'n/no-process-exit': 0
    }
  }
];
