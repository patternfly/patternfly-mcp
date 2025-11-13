import * as docsLocal from '../docs.local';
import { getLocalDocs } from '../docs.local';
import { type GlobalOptions } from '../options';

describe('docsLocal', () => {
  it('should return specific properties', () => {
    expect(docsLocal).toMatchSnapshot();
  });
});

describe('getLocalDocs', () => {
  it.each([
    {
      description: 'default',
      options: undefined
    },
    {
      description: 'with custom docsPath',
      options: { docsPath: 'custom/docs/path' }
    }
  ])('should return local references when called, $description', ({ options }) => {
    expect(getLocalDocs(options as GlobalOptions)).toMatchSnapshot();
  });
});

