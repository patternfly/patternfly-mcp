import {
  SET_OPTIONS,
  EXPERIMENTAL_OPTIONS,
  EXPERIMENTAL_CLI_OPTIONS,
  PROGRAMMATIC_OPTIONS
} from '../options';
import { DEFAULT_OPTIONS } from '../options.defaults';

describe('SET_OPTIONS', () => {
  it('should have PROGRAMMATIC_OPTIONS matching all SET_OPTIONS keys', () => {
    expect(PROGRAMMATIC_OPTIONS).toEqual(Object.keys(SET_OPTIONS));
  });

  it('should correctly derive EXPERIMENTAL_OPTIONS from registry metadata', () => {
    const expected = Object.entries(SET_OPTIONS)
      .filter(([_, meta]) => meta.experimental)
      .map(([key]) => key);

    expect(Array.from(EXPERIMENTAL_OPTIONS)).toEqual(expected);
  });

  it('should correctly derive EXPERIMENTAL_CLI_OPTIONS from registry metadata', () => {
    const expected = Object.entries(SET_OPTIONS)
      .filter(([_, meta]) => meta.experimental && meta.cli)
      .map(([key]) => key);

    expect(Array.from(EXPERIMENTAL_CLI_OPTIONS)).toEqual(expected);
  });

  it('should ensure every registered option has a default or is experimental', () => {
    const defaultKeys = Object.keys(DEFAULT_OPTIONS);

    Object.entries(SET_OPTIONS).forEach(([key, meta]) => {
      const hasDefault = defaultKeys.includes(key);

      // Allow experimental options to bypass the default requirement
      expect(hasDefault || meta.experimental).toBe(true);
    });
  });

  it('should enforce that CLI-only experimental options are a subset of all experimental options', () => {
    for (const cliOption of EXPERIMENTAL_CLI_OPTIONS) {
      expect(EXPERIMENTAL_OPTIONS.has(cliOption)).toBe(true);
    }
  });
});
