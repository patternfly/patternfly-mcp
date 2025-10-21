import * as docsChart from '../docs.chart';

describe('docsChart', () => {
  it('should return specific properties', () => {
    expect(docsChart).toMatchSnapshot();
  });
});

