import { type AppSession, type GlobalOptions } from './options';
import { getOptions, getSessionOptions } from './options.context';
import { type McpCollectionCreator } from './collections';

/**
 * Composes multi-source record collections across process boundaries.
 *
 * @param builtinCreators
 * @param {GlobalOptions} _options - Global options.
 * @param {AppSession} _session - Session options.
 * @returns Promise array of collection creators.
 */
const composeCollections = async (
  builtinCreators: McpCollectionCreator[],
  _options: GlobalOptions = getOptions(),
  _session: AppSession = getSessionOptions()
): Promise<McpCollectionCreator[]> => {
  // Wrap built-in creators to enforce trusted _isInternal. Ties into what options, session values are available.
  const securedBuiltinCreators = builtinCreators.map((creator): McpCollectionCreator => opt => {
    const [name, callback, config] = creator(opt);

    return [
      name,
      callback,
      {
        ...config,
        _isInternal: true
      }
    ];
  });

  if (securedBuiltinCreators.length === 0) {
    return [];
  }

  return securedBuiltinCreators;
};

export {
  composeCollections
};
