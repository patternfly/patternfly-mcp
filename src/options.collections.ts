import { type ToolOptions, setToolOptions } from './options.tools';

/**
 * Options for records. A limited subset of options.
 *
 * @alias ToolOptions
 */
type CollectionOptions = ToolOptions;

/**
 * Return a refined set of options from global options for records.
 *
 * @alias setToolOptions
 */
const setCollectionOptions = setToolOptions;

export { setCollectionOptions, type CollectionOptions };
