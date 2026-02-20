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
              ignoreCodes: [1343]
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
