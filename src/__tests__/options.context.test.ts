import { setOptions, getOptions } from '../options.context';

describe('apply context options', () => {
  it.each([
    {
      description: 'default',
      options: [{ docsHost: true }],
      findProperty: 'docsHost'
    },
    {
      description: 'confirm by applying a potential property outside of typings',
      options: [{ lorem: 'ipsum' }],
      findProperty: 'lorem'
    },
    {
      description: 'multiple property updates',
      options: [{ name: 'ipsum' }, { name: 'dolor sit amet' }, { name: 'consectetur adipiscing elit' }],
      findProperty: 'name'
    }
  ])('should set and get basic options, $description', ({ options, findProperty }) => {
    options.forEach(opts => {
      // @ts-expect-error - Purposefully not typed
      const setOpts = setOptions(opts);
      const getOpts = getOptions();

      expect(Object.isFrozen(setOpts)).toBe(true);
      expect(Object.isFrozen(getOpts)).toBe(true);
      expect(setOpts).toEqual(getOpts);

      // @ts-expect-error - Purposefully not typed
      expect(`${findProperty} = ${getOpts[findProperty]}`).toMatchSnapshot();
    });
  });
});
