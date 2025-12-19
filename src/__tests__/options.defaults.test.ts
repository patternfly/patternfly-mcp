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
});
