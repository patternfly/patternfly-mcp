import { getNodeMajorVersion } from '../options.helpers';

describe('getNodeMajorVersion', () => {
  it('should get the current Node.js version', () => {
    // Purposeful failure in the event the process.versions.node value is not available
    expect(getNodeMajorVersion(process.versions.node)).not.toBe(0);
  });

  it.each([
    {
      description: 'number failure',
      value: 1_000_000,
      expected: 0
    },
    {
      description: 'string',
      value: 'lorem ipsum',
      expected: 0
    },
    {
      description: 'null failure',
      value: null,
      expected: 0
    },
    {
      description: 'undefined failure',
      value: undefined,
      expected: 0
    },
    {
      description: 'NaN failure',
      value: NaN,
      expected: 0
    },
    {
      description: 'operators',
      value: '<=20',
      expected: 20
    },
    {
      description: 'operators and semver',
      value: '<=20.0.1',
      expected: 20
    }
  ])('should handle, $description', ({ value, expected }) => {
    expect(getNodeMajorVersion(value as any)).toBe(expected);
  });
});
