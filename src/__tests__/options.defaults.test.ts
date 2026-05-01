import { DEFAULT_OPTIONS } from '../options.defaults';

describe('options defaults', () => {
  it('should return specific properties', () => {
    expect(DEFAULT_OPTIONS).toMatchSnapshot('defaults');
  });
});
