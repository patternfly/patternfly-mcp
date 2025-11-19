// Shared helpers for all Jest tests

/**
 * Note: Mock child_process to avoid issues with execSync in tests
 */
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: (...args: any) => `<execSync>${JSON.stringify(args)}</execSync>`
}));

/**
 * Note: Mock fkill to avoid ES module import issues in Jest
 * - Returns a resolved promise to simulate successful process kill
 */
jest.mock('fkill', () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined)
}));

/**
 * Note: Mock pid-port to avoid ES module import issues in Jest
 * - Returns undefined to simulate port is free (no process found)
 */
jest.mock('pid-port', () => ({
  __esModule: true,
  portToPid: jest.fn().mockResolvedValue(undefined)
}));

/**
 * Note: Mock @patternfly/patternfly-component-schemas/json to avoid top-level await issues in Jest
 * - Individual tests can override mock
 */
jest.mock('@patternfly/patternfly-component-schemas/json', () => ({
  componentNames: ['Button', 'Alert', 'Card', 'Modal', 'AlertGroup', 'Text', 'TextInput'],
  getComponentSchema: jest.fn().mockImplementation((name: string) => {
    if (name === 'Button') {
      return Promise.resolve({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        title: 'Button Props',
        description: 'Props for the Button component',
        properties: {
          variant: { type: 'string', enum: ['primary', 'secondary'] },
          size: { type: 'string', enum: ['sm', 'md', 'lg'] },
          children: { type: 'string', description: 'Content rendered inside the button' }
        },
        required: ['children'],
        additionalProperties: false
      });
    }

    throw new Error(`Component "${name}" not found`);
  })
}), { virtual: true });
