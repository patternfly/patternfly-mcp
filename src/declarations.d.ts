// Type declarations for @patternfly/patternfly-component-schemas/json
// This file is needed because the package doesn't export TypeScript types.
// TODO: Remove this file once the package exports its own types.

declare module '@patternfly/patternfly-component-schemas/json' {

  /**
   * An array of all available PatternFly component names.
   */
  export const componentNames: string[];

  /**
   * A function that retrieves the JSON schema for a given component.
   * Returns the JSON Schema object directly from schemas.json
   *
   * @param componentName The name of the component to get the schema for.
   * @return A promise that resolves with the JSON Schema object.
   */
  export function getComponentSchema(componentName: string): Promise<{
    $schema: string;
    type: string;
    title: string;
    description: string;
    properties: Record<string, any>;
    additionalProperties?: boolean;
    required?: string[];
  }>;
}
