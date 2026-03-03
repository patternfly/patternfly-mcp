import assert from 'node:assert';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

/**
 * MCP assert. Centralizes and throws an error if the validation fails.
 *
 * @param condition - Function or condition to be validated.
 * @param message - Thrown error message, or function, that returns the error message.
 * @param {ErrorCode} [code] - Thrown error code when validation fails. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws {McpError} Throw the provided error message and code on failure.
 */
const mcpAssert = (condition: unknown, message: string | (() => string), code: ErrorCode = ErrorCode.InvalidParams) => {
  try {
    const result = typeof condition === 'function' ? condition() : condition;
    const resultMessage = typeof message === 'function' ? message() : message;

    assert.ok(result, resultMessage);
  } catch (error) {
    throw new McpError(code, (error as Error).message);
  }
};

/**
 * General purpose input assert/validation function.
 *
 * @alias mcpAssert
 *
 * @param condition - Function or condition to be validated.
 * @param message - Thrown error message, or function, that returns the error message.
 * @param {ErrorCode} [code] - Thrown error code when validation fails. Defaults to `ErrorCode.InvalidParams`.
 *
 * @throws {McpError} Throw the provided error message and code on failure.
 */
function assertInput(
  condition: unknown,
  message: string | (() => string),
  code?: ErrorCode
): asserts condition {
  mcpAssert(condition, message, code);
}

/**
 * Assert/validate if the input is a non-empty string.
 *
 * @param input - Input value
 * @param [options] - Validation options
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error message. Defaults to 'Input'.
 * @param [options.message] - Custom error message. A default error message with optional `inputDisplayName` is generated if not provided.
 *
 * @throws McpError If input is not a non-empty string.
 */
function assertInputString(
  input: unknown,
  { inputDisplayName, message }: { inputDisplayName?: string, message?: string } = {}
): asserts input is string {
  const isValid = typeof input === 'string' && input.trim().length > 0;

  mcpAssert(isValid, message || `"${inputDisplayName || 'Input'}" must be a non-empty string`);
}

/**
 * Assert/validate if the input is a string, non-empty, and meets min and max length requirements.
 *
 * @param input - Input string
 * @param options - Validation options
 * @param options.max - Maximum length of the string. `Required`
 * @param options.min - Minimum length of the string. `Required`
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error message. Defaults to 'Input'.
 * @param [options.message] - Error description. A default error message with optional `inputDisplayName` is generated if not provided.
 *
 * @throws McpError If input is not a string or does not meet length requirements.
 */
function assertInputStringLength(
  input: unknown,
  { max, min, inputDisplayName, message }: { max: number, min: number, inputDisplayName?: string, message?: string }
): asserts input is string {
  const isValid = typeof input === 'string' && input.trim().length <= max && input.trim().length >= min;

  mcpAssert(isValid, message || `"${inputDisplayName || 'Input'}" must be a string from ${min} to ${max} characters`);
}

/**
 * Assert/validate if input array entries are strings and have min and max length.
 *
 * @param input - Array of strings
 * @param options - Validation options
 * @param options.max - Maximum length of each string in the array. `Required`
 * @param options.min - Minimum length of each string in the array. `Required`
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error messages. Defaults to 'Input'.
 * @param [options.message] - Error description. A default error message with optional `inputDisplayName` is generated if not provided.
 *
 * @throws McpError If input is not an array of strings or array entries do not meet length requirements.
 */
function assertInputStringArrayEntryLength(
  input: unknown,
  { max, min, inputDisplayName, message }: { max: number, min: number, inputDisplayName?: string, message?: string }
): asserts input is string[] {
  const isValid = Array.isArray(input) && input.every(entry => typeof entry === 'string' && entry.trim().length <= max && entry.trim().length >= min);

  mcpAssert(isValid, message || `"${inputDisplayName || 'Input'}" array must contain strings from ${min} to ${max} characters`);
}

/**
 * Assert/validate if input is a string or number and is one of the allowed values.
 *
 * @param input - The input value
 * @param values - List of allowed values
 * @param [options] - Validation options
 * @param [options.inputDisplayName] - Display name for the input. Used in the default error messages. Defaults to 'Input'.
 * @param [options.message] - Error description. A default error message with optional `inputDisplayName` is generated if not provided.
 *
 * @throws McpError If input is not a string or number or is not one of the allowed values.
 */
function assertInputStringNumberEnumLike(
  input: unknown,
  values: unknown,
  { inputDisplayName, message }: { inputDisplayName?: string, message?: string } = {}
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

  mcpAssert(isValid, updatedDescription, errorCode);
}

export {
  assertInput,
  assertInputString,
  assertInputStringLength,
  assertInputStringArrayEntryLength,
  assertInputStringNumberEnumLike
};
