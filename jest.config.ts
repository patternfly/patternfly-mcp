const tsConfig = {
  useESM: true,
  tsconfig: '<rootDir>/tsconfig.json'
};

const baseConfig = {
  extensionsToTreatAsEsm: ['.ts'],
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 30000,
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        ...tsConfig
      }
    ]
  }
};

export default {
  projects: [
    {
      displayName: 'unit',
      roots: ['src'],
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/jest.setupTests.ts'],
      ...baseConfig,
      transform: {
        '^.+\\.(ts|tsx)$': [
          'ts-jest',
          {
            ...tsConfig,
            diagnostics: {
              // See codes https://github.com/Microsoft/TypeScript/blob/main/src/compiler/diagnosticMessages.json
              // 1324 - Dynamic imports only support a second argument when the '--module' option is...
              // 1343 - The 'import.meta' meta-property is only allowed when the '--module' option is...
              ignoreCodes: [1324, 1343]
            },
            astTransformers: {
              before: [
                {
                  path: 'ts-jest-mock-import-meta'
                }
              ]
            }
          }
        ]
      }
    },
    {
      displayName: 'e2e',
      roots: ['tests/e2e'],
      testMatch: ['<rootDir>/tests/e2e/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/e2e/jest.setupTests.ts'],
      transformIgnorePatterns: [
        '<rootDir>/dist/'
      ],
      ...baseConfig
    },
    {
      displayName: 'audit',
      roots: ['tests/audit'],
      testMatch: ['<rootDir>/tests/audit/**/*.test.ts'],
      ...baseConfig
    }
  ]
};
