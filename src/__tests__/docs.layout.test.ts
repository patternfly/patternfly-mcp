import * as docsLayout from '../docs.layout';

describe('docsLayout', () => {
  it('should return specific properties', () => {
    expect(docsLayout).toMatchSnapshot();
  });
});

