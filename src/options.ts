import {
  type DefaultOptions,
  type LoggingOptions,
  type HttpOptions,
  type ModeOptions
} from './options.defaults';

/**
 * Global options, convenience type for `DefaultOptions`
 */
type GlobalOptions = DefaultOptions & ProgrammaticOptionsBase;

/**
 * Session defaults, not user-configurable
 */
type AppSession = {
  readonly sessionId: string;
  readonly publicSessionId: string;
  readonly channelName: string;
};

/**
 * Configuration metadata for an option.
 * The `_type` property is a phantom property used only for TypeScript inference.
 *
 * See {@link defineOption} and {@link MakeExperimental}
 */
interface OptionConfig<T, C extends boolean = boolean, E extends boolean = boolean> {
  readonly cli: C;
  readonly experimental: E;
  readonly _type: T;
}

/**
 * Helper to define an option with metadata-first inference.
 *
 * Allows 'C' and 'E' to be inferred strictly from the value
 * without being widened, even when 'T' is provided later.
 *
 * @param config - Option configuration
 * @param config.cli - Required `boolean` indicating CLI availability.
 * @param config.experimental - Optional `boolean` indicating option is experimental.
 */
const defineOption = <const C extends boolean, const E extends boolean = false>(
  config: { cli: C; experimental?: E }
) => <T>(): OptionConfig<T, C, E> => ({
  ...config,
  experimental: (config.experimental ?? false) as E,
  _type: undefined as unknown as T
} as OptionConfig<T, C, E>);

/**
 * Set options for consumers.
 *
 * To expose options for consumer use:
 * 1. Add the internal key name to `SET_OPTIONS` using {@link defineOption}
 * 2. Config `cli: true`, add the flag to `parseCliOptions`
 *    - Initialize the key on the `result` object (e.g. `loremIpsum: undefined`).
 *    - Add a `switch` case for the arg (e.g. `--lorem-ipsum`).
 *    - The option is exposed to consumers as `--lorem-ipsum`
 * 3. Config `experimental`
 *    - If `experimental: false`, add the internal name and type to {@link DefaultOptions} and name with default to {@link DEFAULT_OPTIONS}
 *    - If `experimental: true`, you can OPTIONALLY skip adding the internal name and type to {@link DefaultOptions} and {@link DEFAULT_OPTIONS}
 *       - The programmatic option is exposed to consumers as `experimentalLoremIpsum`
 *       - The CLI option is exposed to consumers as `--experimental-lorem-ipsum`
 *
 * @example Add a new option:
 * {
 *   loremIpsum: defineOption({
 *     cli: true,
 *     experimental: false
 *   })<DefaultOptions['loremIpsum']>(),
 * }
 *
 * @note We account for scenarios where an option may be set for consumers
 * but there is no corresponding entry in `options.defaults` by requiring it
 * to be `experimental`.
 */
const SET_OPTIONS = {
  mode: defineOption({ cli: true })<DefaultOptions['mode']>(),
  modeOptions: defineOption({ cli: true })<Partial<ModeOptions>>(),
  http: defineOption({ cli: true })<Partial<HttpOptions>>(),
  isHttp: defineOption({ cli: true })<boolean>(),
  logging: defineOption({ cli: true })<Partial<LoggingOptions>>(),
  pluginIsolation: defineOption({ cli: true })<DefaultOptions['pluginIsolation']>(),
  docsPaths: defineOption({ cli: false })<DefaultOptions['docsPaths']>(),
  name: defineOption({ cli: false })<string>(),
  toolModules: defineOption({ cli: true })<DefaultOptions['toolModules']>(),
  version: defineOption({ cli: false })<string>(),
  contextManagement: defineOption({ cli: true, experimental: true })<DefaultOptions['contextManagement']>()
} as const;

/**
 * See {@link SET_OPTIONS}
 */
type SetOptions = typeof SET_OPTIONS;

/**
 * See {@link SET_OPTIONS}
 */
type ProgrammaticOptionsKey = keyof SetOptions;

/**
 * See {@link SET_OPTIONS}
 */
type ProgrammaticOptionsBase = {
  -readonly [K in ProgrammaticOptionsKey]?: SetOptions[K]['_type'] | undefined;
};

/**
 * See {@link SET_OPTIONS}
 */
type CliOptionsBase = {
  -readonly [K in ProgrammaticOptionsKey as SetOptions[K]['cli'] extends true ? K : never]?:
  K extends 'toolModules' ? string[] | undefined : SetOptions[K]['_type'] | undefined
};

/**
 * Convert specific options towards an "experimental-" prefix for consumers.
 *
 * See {@link SET_OPTIONS}
 */
type MakeExperimental<T, K extends string = never> = T & {
  -readonly [P in Extract<K, keyof T> as `experimental${Capitalize<P & string>}`]?: T[P] | undefined
};

/**
 * See {@link SET_OPTIONS}
 */
type ExperimentalOptions = keyof {
  [K in ProgrammaticOptionsKey as SetOptions[K]['experimental'] extends true ? K : never]: unknown
} & string;

/**
 * Consumer facing CLI options.
 */
type CliOptions = MakeExperimental<CliOptionsBase, ExperimentalOptions>;

/**
 * Consumer facing programmatic options.
 */
type ProgrammaticOptions = MakeExperimental<ProgrammaticOptionsBase, ExperimentalOptions>;

/**
 * See {@link SET_OPTIONS}
 */
type ExperimentalOptionKey = ProgrammaticOptionsKey & string;

/**
 * Experimental options list.
 *
 * See {@link SET_OPTIONS}
 */
const EXPERIMENTAL_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(SET_OPTIONS)
    .filter(([_, meta]) => meta.experimental)
    .map(([key]) => key as ExperimentalOptionKey)
);

/**
 * Experimental options list for CLI.
 *
 * See {@link SET_OPTIONS}
 */
const EXPERIMENTAL_CLI_OPTIONS = new Set<ExperimentalOptionKey>(
  Object.entries(SET_OPTIONS)
    .filter(([_, meta]) => meta.experimental && meta.cli)
    .map(([key]) => key as ExperimentalOptionKey)
);

/**
 * Options list for programmatic use.
 *
 * See {@link SET_OPTIONS}
 */
const PROGRAMMATIC_OPTIONS = Object.keys(SET_OPTIONS) as ReadonlyArray<ProgrammaticOptionsKey>;

export {
  EXPERIMENTAL_CLI_OPTIONS,
  EXPERIMENTAL_OPTIONS,
  PROGRAMMATIC_OPTIONS,
  SET_OPTIONS,
  type AppSession,
  type CliOptions,
  type CliOptionsBase,
  type DefaultOptions,
  type ExperimentalOptions,
  type ExperimentalOptionKey,
  type GlobalOptions,
  type MakeExperimental,
  type ProgrammaticOptions,
  type ProgrammaticOptionsBase,
  type ProgrammaticOptionsKey,
  type SetOptions
};
