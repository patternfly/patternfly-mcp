import { createHash } from 'crypto';

/**
 * Simple hash from content.
 *
 * @param {unknown} content - Content to hash
 * @returns {string} Hash string
 */
const generateHash = (content: unknown) =>
  createHash('sha1')
    .update(JSON.stringify({ value: (typeof content === 'function' && content.toString()) || content }))
    .digest('hex');

/**
 * Check if "is a Promise", "Promise like".
 *
 * @param {object} obj - Object to check
 * @returns {boolean} True if object is a Promise
 */
const isPromise = (obj: unknown) => /^\[object (Promise|Async|AsyncFunction)]/.test(Object.prototype.toString.call(obj));

export {
  generateHash,
  isPromise
};
