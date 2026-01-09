import { type McpResourceCreator } from './server';
import { type AppSession, type GlobalOptions } from './options';
import { getOptions, getSessionOptions } from './options.context';
import { log } from './logger';

/**
 * Compose built-in resource creators.
 *
 * @note This is primarily a placeholder for future external resources.
 *
 * @param builtinCreators - Built-in resource creators
 * @param {GlobalOptions} options - Global options.
 * @param {AppSession} _sessionOptions - Session options.
 * @returns {Promise<McpResourceCreator[]>} Promise array of resource creators
 */
const composeResources = async (
  builtinCreators: McpResourceCreator[],
  { resourceModules }: GlobalOptions = getOptions(),
  _sessionOptions: AppSession = getSessionOptions()
): Promise<McpResourceCreator[]> => {
  const resourceCreators: McpResourceCreator[] = [...builtinCreators];

  if (!Array.isArray(resourceModules) || resourceModules.length === 0) {
    log.info('No external resources loaded.');

    return resourceCreators;
  }

  return resourceCreators;
};

export { composeResources };
