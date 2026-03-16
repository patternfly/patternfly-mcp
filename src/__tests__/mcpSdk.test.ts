import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { UriTemplate } from '@modelcontextprotocol/sdk/shared/uriTemplate.js';
import { registerResource } from '../mcpSdk';

describe('registerResource', () => {
  // If this test starts to fail, indicating it is matching partial queries, then the next step is to
  // investigate `UriTemplate` and determine if our `registerResource` implementation is still necessary.
  it('should demonstrate that MCP SDK UriTemplate requires all variables for query templates', () => {
    const templateStr = 'patternfly://test{?name,version}';
    const template = new UriTemplate(templateStr);

    // 1. Full match works
    const fullUri = 'patternfly://test?name=button&version=v6';

    expect(template.match(fullUri)).toEqual({ name: 'button', version: 'v6' });

    // 2. Partial match (missing version) FAILS in the MCP SDK UriTemplate implementation
    // This is the "limitation" that registerResource works around by registering 'patternfly://test{?name}'
    const partialUri = 'patternfly://test?name=button';

    expect(template.match(partialUri)).toBeNull();

    // 3. Base URI match (no params) FAILS
    const baseUri = 'patternfly://test';

    expect(template.match(baseUri)).toBeNull();
  });

  it('should register a callback that receives a static uri for resources', async () => {
    const mockServer = {
      registerResource: jest.fn()
    };
    const name = 'test-resource';
    const uriStatic = 'patternfly://test/index';
    const config = { title: 'Test', description: 'Test', mimeType: 'text/markdown' as const };
    const callback = jest.fn().mockImplementation((passedUri: URL) => ({
      contents: [{
        uri: passedUri?.toString(),
        mimeType: 'text/markdown',
        text: ''
      }]
    }));

    registerResource(
      mockServer as any,
      name,
      uriStatic,
      config,
      callback as any,
      undefined
    );

    const registeredCallback = mockServer.registerResource.mock.calls[0][3];
    const uri = new URL('patternfly://test/index');
    const result = await registeredCallback(uri, {});

    expect(result.contents[0].uri).toBe(uri.toString());
  });

  it('should register a callback that receives a template uri that handles variables', async () => {
    const mockServer = {
      registerResource: jest.fn()
    };
    const name = 'test-resource';
    const uriTemplate = new ResourceTemplate('patternfly://test/{name}', { list: undefined });
    const config = { title: 'Test', description: 'Test', mimeType: 'text/markdown' as const };
    const callback = jest.fn().mockImplementation((passedUri: URL, variables: any) => ({
      contents: [{
        uri: passedUri?.toString(),
        mimeType: 'text/markdown',
        text: `name=${variables?.name || ''}`
      }]
    }));

    registerResource(
      mockServer as any,
      name,
      uriTemplate,
      config,
      callback as any,
      undefined
    );

    const registeredCallback = mockServer.registerResource.mock.calls[0][3];
    const uri = new URL('patternfly://test/button');
    const variables = { name: 'button', version: 'v6' };
    const result = await registeredCallback(uri, variables);

    expect(result.contents[0].uri).toBe(uri.toString());
    expect(result.contents[0].text).toBe('name=button');
    expect(callback).toHaveBeenCalledWith(uri, variables);
  });

  it('should register incremental permutations for query templates', () => {
    const mockServer = { registerResource: jest.fn() };
    const name = 'test-resource';
    const uriTemplate = new ResourceTemplate('patternfly://test{?name,version,category}', { list: undefined });
    const config = { title: 'Test', description: 'Test', mimeType: 'text/markdown' as const };
    const callback = jest.fn();

    registerResource(mockServer as any, name, uriTemplate, config, callback, {} as any);

    // Expected registrations in order (Reverse order for SDK matching):
    // 1. Original: patternfly://test{?name,version,category}
    // 2. Incremental: patternfly://test{?name,version}
    // 3. Incremental: patternfly://test{?name}
    // 4. Base: patternfly://test
    expect(mockServer.registerResource).toHaveBeenCalledTimes(4);

    const calls: any[] = mockServer.registerResource.mock.calls.map(call => ({ name: call[0], template: call[1].uriTemplate.template }));

    expect(calls[0].template).toBe('patternfly://test{?name,version,category}');
    expect(calls[1].template).toBe('patternfly://test{?name,version}');
    expect(calls[2].template).toBe('patternfly://test{?name}');
    expect(calls[3].template).toBe('patternfly://test');

    // Verify the original name
    expect(calls[0].name).toBe(name);

    // Verify name incrementation
    expect(calls[1].name).toBe('test-resource-name-version');
    expect(calls[2].name).toBe('test-resource-name');
    expect(calls[3].name).toBe('test-resource-empty');
  });

  it('should register all parameter permutations for query templates, when enabled', () => {
    const mockServer = { registerResource: jest.fn() };
    const name = 'test-resource';
    const uriTemplate = new ResourceTemplate('patternfly://test{?a,b}', { list: undefined });
    const config = { title: 'Test', description: 'Test', mimeType: 'text/markdown' as const };
    const callback = jest.fn();

    registerResource(mockServer as any, name, uriTemplate, config, callback, {
      registerAllSearchCombinations: true
    } as any);

    // Expected combinations for {a, b}:
    // Original: {a, b}
    // Others: {b}, {a}, {} (empty)
    // Total: 4
    expect(mockServer.registerResource).toHaveBeenCalledTimes(4);

    const calls: any[] = mockServer.registerResource.mock.calls.map(call => call[1].uriTemplate.template);

    // Permutation sequence could shift, just do a check for "contains"
    expect(calls).toContain('patternfly://test{?a,b}');
    expect(calls).toContain('patternfly://test{?b}');
    expect(calls).toContain('patternfly://test{?a}');
    expect(calls).toContain('patternfly://test');
  });
});
