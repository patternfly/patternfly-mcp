import * as options from '../options.defaults';

describe('options defaults', () => {
  it('should return specific properties', () => {
    expect(options).toMatchSnapshot();
  });
});
