import * as docsComponent from '../docs.component';

describe('docsComponent', () => {
  it('should return specific properties', () => {
    expect(docsComponent).toMatchSnapshot();
  });
});

