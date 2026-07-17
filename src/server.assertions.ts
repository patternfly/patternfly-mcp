import assert from 'node:assert';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import {
  isUrl,
  isWhitelistedUrl,
  stringJoin
} from './server.helpers';
import { isPatternFlyUri } from './patternFly.support';
import { DEFAULT_OPTIONS, type WhitelistUrl } from './options.defaults';

/**
 * Type for assertion error instances.
 *
 * @param message - Error message describing the reason for the assertion.
 * @param cause - Cause of the error, typically another error or additional information.
 * @returns The constructed `Error` instance.
 */
type AssertErrorFactory = (message: string, cause: unknown) => Error;

/**
 * Type for an `ErrorCode` or `AssertErrorFactory` associated with parameter
 * `codeOrError` see {@link mcpAssert}.
 */
type AssertCodeOrError = ErrorCode | AssertErrorFactory;

/**
 * MCP assert. Centralizes and throws an error if the validation fails.
 *
 * @param condition - Function or condition to be validated.
 * @param message - Thrown error message, or function, that returns the error message.
 * @param {AssertCodeOrError} [codeOrError] - Thrown error code when validation fails OR
 *     a function that returns an error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws {McpError} By default throw the provided MCP error message and code on failure.
 * @throws {Error} When `codeOrError` is provided an error factory.
 */
const mcpAssert = (
  condition: unknown,
  message: string | (() => string),
  codeOrError: AssertCodeOrError = ErrorCode.InvalidParams
) => {
  try {
    const result = typeof condition === 'function' ? condition() : condition;
    const resultMessage = typeof message === 'function' ? message() : message;

    assert.ok(result, resultMessage);
  } catch (error) {
    const errorMessage = (error as Error).message;

    if (typeof codeOrError === 'function') {
      throw codeOrError(errorMessage, error);
    }

    throw new McpError(codeOrError, errorMessage);
  }
};

/**
 * General purpose input assert/validation function.
 *
 * Alias of {@link mcpAssert}.
 *
 * @param condition - Function or condition to be validated.
 * @param message - Thrown error message, or function, that returns the error message.
 * @param [codeOrError] - Thrown error code when validation fails OR a function that returns an
 *     error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws McpError By default throw the provided MCP error message and code on failure.
 * @throws Error When `codeOrError` is provided an error factory.
 */
function assertInput(
  condition: unknown,
  message: string | (() => string),
  codeOrError?: AssertCodeOrError
): asserts condition {
  mcpAssert(condition, message, codeOrError);
}

/**
 * Assert/validate if the input is a non-empty string.
 *
 * @param input - Input value
 * @param [options] - Validation options
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error message.
 *     Defaults to 'Input'.
 * @param [options.message] - Custom error message. A default error message with optional `inputDisplayName`
 *     is generated if not provided.
 * @param [options.codeOrError] - Thrown error code when validation fails OR a function that returns an
 *     error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws McpError If input is not a non-empty string.
 * @throws Error When `codeOrError` is provided an error factory.
 */
function assertInputString(
  input: unknown,
  {
    inputDisplayName, message, codeOrError
  }: { inputDisplayName?: string; message?: string; codeOrError?: AssertCodeOrError } = {}
): asserts input is string {
  const isValid = typeof input === 'string' && input.trim().length > 0;

  mcpAssert(isValid, message || `"${inputDisplayName || 'Input'}" must be a non-empty string`, codeOrError);
}

/**
 * Assert/validate if the input is a string, non-empty, and meets min and max length requirements.
 *
 * @param input - Input string
 * @param options - Validation options
 * @param options.max - Maximum length of the string. `Required`
 * @param options.min - Minimum length of the string. `Required`
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error message.
 *     Defaults to 'Input'.
 * @param [options.message] - Error description. A default error message with optional `inputDisplayName`
 *     is generated if not provided.
 * @param [options.codeOrError] - Thrown error code when validation fails OR a function that returns an
 *     error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws McpError If input is not a string or does not meet length requirements.
 * @throws Error When `codeOrError` is provided an error factory.
 */
function assertInputStringLength(
  input: unknown,
  {
    max, min, inputDisplayName, message, codeOrError
  }: { max: number; min: number; inputDisplayName?: string; message?: string; codeOrError?: AssertCodeOrError }
): asserts input is string {
  const isValid = typeof input === 'string' && input.trim().length <= max && input.trim().length >= min;

  mcpAssert(isValid, message || `"${inputDisplayName || 'Input'}" must be a string from ${min} to ${max} characters`, codeOrError);
}

/**
 * Assert/validate if input array entries are strings and have min and max length.
 *
 * @param input - Array of strings
 * @param options - Validation options
 * @param options.max - Maximum length of each string in the array. `Required`
 * @param options.min - Minimum length of each string in the array. `Required`
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error messages.
 *     Defaults to 'Input'.
 * @param [options.message] - Error description. A default error message with optional `inputDisplayName`
 *     is generated if not provided.
 * @param [options.codeOrError] - Thrown error code when validation fails OR a function that returns an
 *     error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws McpError If input is not an array of strings or array entries do not meet length requirements.
 * @throws Error When `codeOrError` is provided an error factory.
 */
function assertInputStringArrayEntryLength(
  input: unknown,
  {
    max, min, inputDisplayName, message, codeOrError
  }: { max: number; min: number; inputDisplayName?: string; message?: string; codeOrError?: AssertCodeOrError }
): asserts input is string[] {
  const isValid = Array.isArray(input) && input.every(entry => typeof entry === 'string' && entry.trim().length <= max && entry.trim().length >= min);

  mcpAssert(isValid, message || `"${inputDisplayName || 'Input'}" array must contain strings from ${min} to ${max} characters`, codeOrError);
}

/**
 * Assert/validate if input is a string or number and is one of the allowed values.
 *
 * @param input - The input value
 * @param values - List of allowed values
 * @param [options] - Validation options
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error messages.
 *     Defaults to 'Input'.
 * @param [options.message] - Error description. A default error message with optional `inputDisplayName`
 *     is generated if not provided.
 * @param [options.codeOrError] - Thrown error code when validation fails OR a function that returns an
 *     error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws McpError If input is not a string or number or is not one of the allowed values.
 * @throws Error When `codeOrError` is provided an error factory.
 */
function assertInputStringNumberEnumLike(
  input: unknown,
  values: unknown,
  {
    inputDisplayName, message, codeOrError
  }: { inputDisplayName?: string; message?: string; codeOrError?: AssertCodeOrError } = {}
): asserts input is string | number {
  const hasArrayWithLength = Array.isArray(values) && values.length > 0;
  let updatedDescription;
  let errorCode;

  if (hasArrayWithLength) {
    errorCode = ErrorCode.InvalidParams;
    updatedDescription = message || `"${inputDisplayName || 'Input'}" must be one of the following values: ${values.join(', ')}`;
  } else {
    errorCode = ErrorCode.InternalError;
    updatedDescription = `Unable to confirm "${inputDisplayName || 'input'}." List of allowed values is empty or undefined.`;
  }

  const isStringOrNumber = typeof input === 'string' || typeof input === 'number';
  const isValid = isStringOrNumber && hasArrayWithLength && values.includes(input);

  mcpAssert(isValid, updatedDescription, codeOrError ?? errorCode);
}

/**
 * Assert/validate that a given input URL string, or array of URL strings, is whitelisted against a
 *     provided list of URLs.
 *
 * @param input - Input URL string, or array of URL strings, to validate.
 * @param {WhitelistUrl[]} whitelist - The list of allowed URLs to compare against.
 * @param [options] - Validation options
 * @param [options.allowedProtocols] - Optional list of allowed URL protocols to validate against.
 * @param [options.inputDisplayName] - Optional display name for the input parameter, used in error messages.
 * @param [options.message] - Optional custom error message to override the default message.
 * @param [options.urlDisplayMaxLength] - Optional maximum length of an invalid URL to display in error messages
 * @param [options.codeOrError] - Thrown error code when validation fails OR a function that returns an
 *     error. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws McpError If input is not an allowed URL against the provided whitelist.
 * @throws Error When `codeOrError` is provided an error factory.
 */
function assertInputUrlWhiteListed(
  input: unknown,
  whitelist: WhitelistUrl[],
  {
    allowedProtocols = DEFAULT_OPTIONS.whitelist.protocols, inputDisplayName, message, urlDisplayMaxLength = 50, codeOrError
  }: {
    allowedProtocols?: string[]; inputDisplayName?: string; message?: string; urlDisplayMaxLength?: number; codeOrError?: AssertCodeOrError
  } = {}
): asserts input is string | string[] {
  const updatedInput = Array.isArray(input) ? input : [input];
  const invalidUrls: unknown[] = [];

  updatedInput.forEach(url => {
    const isRemote = typeof url === 'string' && allowedProtocols.some(protocol => url.startsWith(protocol));

    if (isRemote) {
      // Dive into condition to avoid flipping else
      if (!isWhitelistedUrl(url, whitelist, { allowedProtocols })) {
        invalidUrls.push(url);
      }
    } else if (isUrl(url, { isStrict: false })) {
      // Dive into condition to avoid flipping else
      if (!isPatternFlyUri(url)) {
        invalidUrls.push(url);
      }
    } else {
      invalidUrls.push(url);
    }
  });

  mcpAssert(
    invalidUrls.length === 0,
    () => message || stringJoin.newline(
      `Access denied: "${inputDisplayName || 'URL input'}" must be within the whitelisted URLs.`,
      `Use official PatternFly documentation sources.`,
      ...invalidUrls.map(invalid => `Invalid URL: ${String(invalid).slice(0, urlDisplayMaxLength)}...`)
    ),
    codeOrError ?? ErrorCode.InvalidParams
  );
}

export {
  mcpAssert,
  assertInput,
  assertInputString,
  assertInputStringLength,
  assertInputStringArrayEntryLength,
  assertInputStringNumberEnumLike,
  assertInputUrlWhiteListed,
  type AssertErrorFactory,
  type AssertCodeOrError
};
