import * as docsLocal from '../docs.local';

describe('docsLocal', () => {
  it('should return specific properties', () => {
    expect(docsLocal).toMatchSnapshot();
  });
});

