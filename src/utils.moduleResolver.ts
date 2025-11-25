/**
 * Utility for module resolution using import.meta.resolve
 * This is separated into its own file to facilitate mocking in tests
 */

export const resolveModule = (modulePath: string): string => import.meta.resolve(modulePath);
