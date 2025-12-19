import { DEFAULT_OPTIONS, getNodeMajorVersion } from '../options.defaults';

describe('options defaults', () => {
  it('should return specific properties', () => {
    expect(DEFAULT_OPTIONS).toMatchSnapshot('defaults');
  });
});

describe('getNodeMajorVersion', () => {
  it('should get the current Node.js version', () => {
    // Purposeful failure in the event the process.versions.node value is not available
    expect(getNodeMajorVersion()).not.toBe(0);
  });

  it.each([
    {
      description: 'number',
      value: 1_000_000
    },
    {
      description: 'string',
      value: 'lorem ipsum'
    },
    {
      description: 'null',
      value: null
    }
  ])('should handle basic failure, $description', ({ value }) => {
    expect(getNodeMajorVersion(value as any)).toBe(0);
  });
});
