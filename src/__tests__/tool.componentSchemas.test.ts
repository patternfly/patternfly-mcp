// Mock the PatternFly schemas module since it uses ES modules
jest.mock('@patternfly/patternfly-component-schemas', () => ({
  componentNames: ['Button', 'Alert', 'Card', 'Modal', 'AlertGroup', 'Text', 'TextInput'],
  getComponentSchema: jest.fn().mockImplementation((name: string) => {
    if (name === 'Button') {
      return Promise.resolve({
        componentName: 'Button',
        propsCount: 10,
        requiredProps: ['children'],
        schema: {
          type: 'object',
          properties: {
            variant: { type: 'string', enum: ['primary', 'secondary'] },
            size: { type: 'string', enum: ['sm', 'md', 'lg'] },
            children: { type: 'string' }
          },
          required: ['children']
        }
      });
    }
    throw new Error(`Component "${name}" not found`);
  })
}));

import { componentSchemasTool } from '../tool.componentSchemas';

describe('componentSchemasTool', () => {
  const [toolName, toolSchema, toolCallback] = componentSchemasTool();

  it('should have correct tool name and schema', () => {
    expect(toolName).toBe('component-schemas');
    expect(toolSchema.description).toContain('PatternFly component schemas');
    expect(toolSchema.inputSchema).toBeDefined();
  });

  describe('list action', () => {
    it('should list all available components', async () => {
      const result = await toolCallback({ action: 'list' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.action).toBe('list');
      expect(response.totalComponents).toBe(7); // Mocked components
      expect(Array.isArray(response.components)).toBe(true);
      expect(response.components).toEqual(['Alert', 'AlertGroup', 'Button', 'Card', 'Modal', 'Text', 'TextInput']); // Sorted mocked components
      expect(response.description).toContain('PatternFly React components');
    });
  });

  describe('get action', () => {
    it('should get schema for a valid component', async () => {
      const result = await toolCallback({ action: 'get', componentName: 'Button' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.action).toBe('get');
      expect(response.componentName).toBe('Button');
      expect(response.propsCount).toBe(10);
      expect(response.schema).toBeDefined();
      expect(response.schema.type).toBe('object');
      expect(response.schema.properties).toBeDefined();
      expect(response.requiredProps).toEqual(['children']);
    });

    it('should handle invalid component name', async () => {
      const result = await toolCallback({ action: 'get', componentName: 'InvalidComponent' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('not found');
      expect(response.suggestion).toContain('search');
    });

    it('should require componentName for get action', async () => {
      const result = await toolCallback({ action: 'get' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('componentName is required');
      expect(response.usage).toBeDefined();
    });

    it('should provide suggestions for similar component names', async () => {
      const result = await toolCallback({ action: 'get', componentName: 'but' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('not found');
      expect(response.suggestions).toBeDefined();
      expect(response.suggestions.length).toBeGreaterThan(0);
      // Should include Button in suggestions
      expect(response.suggestions.some((s: any) => s.name.includes('Button'))).toBe(true);
    });
  });

  describe('search action', () => {
    it('should search components with fuzzy matching', async () => {
      const result = await toolCallback({ action: 'search', query: 'but' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.action).toBe('search');
      expect(response.query).toBe('but');
      expect(response.totalResults).toBeGreaterThan(0);
      expect(Array.isArray(response.results)).toBe(true);
      expect(response.results[0]).toHaveProperty('name');
      expect(response.results[0]).toHaveProperty('score');
      expect(response.results[0]).toHaveProperty('matchType');
    });

    it('should require query for search action', async () => {
      const result = await toolCallback({ action: 'search' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('query is required');
    });

    it('should respect limit parameter', async () => {
      const result = await toolCallback({ action: 'search', query: 'a', limit: 3 });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.results.length).toBeLessThanOrEqual(3);
    });

    it('should return results sorted by score', async () => {
      const result = await toolCallback({ action: 'search', query: 'alert' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      // Results should be sorted by score (descending)
      for (let i = 1; i < response.results.length; i++) {
        expect(response.results[i - 1].score).toBeGreaterThanOrEqual(response.results[i].score);
      }
    });
  });

  describe('error handling', () => {
    it('should handle unknown action', async () => {
      const result = await toolCallback({ action: 'unknown' });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe('text');

      const response = JSON.parse(result.content[0].text);

      expect(response.error).toContain('Unknown action');
      expect(response.usage).toBeDefined();
    });
  });
});
