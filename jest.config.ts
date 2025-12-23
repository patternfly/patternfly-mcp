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
      roots: ['tests'],
      testMatch: ['<rootDir>/tests/**/*.test.ts'],
      setupFilesAfterEnv: ['<rootDir>/tests/jest.setupTests.ts'],
      transformIgnorePatterns: [
        '<rootDir>/dist/'
      ],
      ...baseConfig
    }
  ]
};
