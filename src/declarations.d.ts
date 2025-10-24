// Create a custom declaration file for the @patternfly/patternfly-component-schemas module
// This file tells TypeScript the basic types for the module since it doesn't provide its own.

declare module '@patternfly/patternfly-component-schemas' {

  /**
   * An array of all available PatternFly component names.
   */
  export const componentNames: string[];

  /**
   * A function that retrieves the JSON schema for a given component.
   *
   * @param componentName The name of the component to get the schema for.
   * @return A promise that resolves with the component schema information.
   */
  export function getComponentSchema(componentName: string): Promise<{
    componentName: string;
    propsCount: number;
    requiredProps: string[];
    schema: Record<string, any>;
  }>;
}
