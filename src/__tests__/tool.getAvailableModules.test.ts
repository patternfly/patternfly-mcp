import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { getAvailableModulesTool } from '../tool.getAvailableModules';
import { getLocalModulesMap } from '../utils.getLocalModulesMap';

// Mock dependencies
jest.mock('../utils.getLocalModulesMap');
jest.mock('../utils.moduleResolver'); // Mock the module resolver to avoid import.meta issues
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

const mockGetLocalModulesMap = getLocalModulesMap as jest.MockedFunction<typeof getLocalModulesMap>;

describe('getAvailableModulesTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = getAvailableModulesTool();

    expect(tool).toMatchSnapshot('structure');
  });
});

describe('getAvailableModulesTool, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return modules list separated by semicolons', async () => {
    const mockModulesMap = {
      Button: '/path/to/button',
      Card: '/path/to/card',
      Table: '/path/to/table'
    };

    mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);

    const [, , callback] = getAvailableModulesTool();
    const result = await callback({ packageName: '@patternfly/react-core' });

    expect(mockGetLocalModulesMap).toHaveBeenCalledWith('@patternfly/react-core');
    expect(result).toMatchSnapshot();
  });

  it('should return empty string when modules map is empty', async () => {
    mockGetLocalModulesMap.mockResolvedValue({});

    const [, , callback] = getAvailableModulesTool();
    const result = await callback({ packageName: '@patternfly/react-core' });

    expect(result).toMatchSnapshot();
  });

  it('should handle modules with special characters in names', async () => {
    const mockModulesMap = {
      'Button-Group': '/path/to/button-group',
      'Data.Table': '/path/to/data-table',
      Nav_Item: '/path/to/nav-item'
    };

    mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);

    const [, , callback] = getAvailableModulesTool();
    const result = await callback({ packageName: '@patternfly/react-core' });

    expect(result).toMatchSnapshot();
  });

  it.each([
    {
      description: 'with Error object',
      error: new Error('Package not found')
    },
    {
      description: 'with string error',
      error: 'String error message'
    },
    {
      description: 'with null error',
      error: null
    }
  ])('should handle getLocalModulesMap errors, $description', async ({ error }) => {
    mockGetLocalModulesMap.mockRejectedValue(error);

    const [, , callback] = getAvailableModulesTool();

    await expect(callback({ packageName: '@patternfly/react-core' })).rejects.toThrow(McpError);
    await expect(callback({ packageName: '@patternfly/react-core' })).rejects.toThrow('Failed to retrieve available modules');
  });

  it('should always call with @patternfly/react-core package', async () => {
    mockGetLocalModulesMap.mockResolvedValue({ Component: '/path' });

    const [, , callback] = getAvailableModulesTool();

    await callback({ packageName: '@patternfly/react-core' });

    expect(mockGetLocalModulesMap).toHaveBeenCalledWith('@patternfly/react-core');
    expect(mockGetLocalModulesMap).toHaveBeenCalledTimes(1);
  });
});
