import { setToolOptions } from '../options.tools';

describe('setToolOptions', () => {
  it.each([
    {
      description: 'default',
      options: {
        name: 'lorem ipsum',
        version: '1.2.3',
        nodeVersion: '22',
        repoName: 'dolor-sit-amet',
        extra: 'consectetur adipiscing elit'
      }
    },
    {
      description: 'random keys',
      options: {
        lorem: 'lorem ipsum',
        ipsum: '1.2.3',
        dolor: '22',
        sit: 'dolor-sit-amet'
      }
    }
  ])('should set a subset of options for tools, $description', ({ options }) => {
    expect(setToolOptions(options as any)).toMatchSnapshot();
  });
});
