import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { getComponentSourceCode } from '../tool.getComponentSourceCode';
import { getLocalModulesMap } from '../utils.getLocalModulesMap';
import { verifyLocalPackage } from '../utils.verifyLocalPackage';
import { readFileAsync } from '../utils.readFile';

// Mock dependencies
jest.mock('../utils.getLocalModulesMap');
jest.mock('../utils.verifyLocalPackage');
jest.mock('../utils.readFile');
jest.mock('../utils.moduleResolver'); // Mock the module resolver to avoid import.meta issues
jest.mock('../server.caching', () => ({
  memo: jest.fn(fn => fn)
}));

const mockGetLocalModulesMap = getLocalModulesMap as jest.MockedFunction<typeof getLocalModulesMap>;
const mockVerifyLocalPackage = verifyLocalPackage as jest.MockedFunction<typeof verifyLocalPackage>;
const mockReadFileAsync = readFileAsync as jest.MockedFunction<typeof readFileAsync>;

describe('getComponentSourceCode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should have a consistent return structure', () => {
    const tool = getComponentSourceCode();

    expect(tool).toMatchSnapshot('structure');
  });
});

describe('getComponentSourceCode, callback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('successful component source retrieval', () => {
    it('should retrieve component source code successfully', async () => {
      const mockPackageStatus = {
        exists: true,
        version: '1.0.0',
        packageRoot: '/test/node_modules/@patternfly/react-core'
      };
      const mockModulesMap = {
        Button: 'dist/dynamic/components/Button'
      };
      const mockIndexSource = `export * from './Button';`;
      const mockComponentSource = `export const Button = () => { return <button>Click me</button>; };`;

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);
      mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);
      mockReadFileAsync
        .mockResolvedValueOnce(mockIndexSource) // index.ts read
        .mockResolvedValueOnce(mockComponentSource); // component file read

      const [, , callback] = getComponentSourceCode();
      const result = await callback({ componentName: 'Button' });

      expect(mockVerifyLocalPackage).toHaveBeenCalledWith('@patternfly/react-core');
      expect(mockGetLocalModulesMap).toHaveBeenCalledWith('@patternfly/react-core');
      expect(result).toMatchSnapshot();
    });

    it('should handle .tsx file when .ts file not found', async () => {
      const mockPackageStatus = {
        exists: true,
        version: '1.0.0',
        packageRoot: '/test/node_modules/@patternfly/react-core'
      };
      const mockModulesMap = {
        Button: 'dist/dynamic/components/Button'
      };
      const mockIndexSource = `export * from './Button';`;
      const mockComponentSource = `export const Button = () => { return <button>Click me</button>; };`;

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);
      mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);
      mockReadFileAsync
        .mockResolvedValueOnce(mockIndexSource) // index.ts read
        .mockRejectedValueOnce(new Error('File not found')) // .ts file fails
        .mockResolvedValueOnce(mockComponentSource); // .tsx file succeeds

      const [, , callback] = getComponentSourceCode();
      const result = await callback({ componentName: 'Button' });

      expect(result).toMatchSnapshot();
    });
  });

  describe('parameter validation', () => {
    it.each([
      {
        description: 'with missing componentName',
        componentName: undefined,
        error: 'Missing required parameter: componentName'
      },
      {
        description: 'with null componentName',
        componentName: null,
        error: 'Missing required parameter: componentName'
      },
      {
        description: 'with non-string componentName',
        componentName: 123,
        error: 'Missing required parameter: componentName'
      },
      {
        description: 'with array componentName',
        componentName: ['Button'],
        error: 'Missing required parameter: componentName'
      }
    ])('should handle invalid parameters, $description', async ({ componentName, error }) => {
      const [, , callback] = getComponentSourceCode();

      await expect(callback({ componentName })).rejects.toThrow(McpError);
      await expect(callback({ componentName })).rejects.toThrow(error);
    });
  });

  describe('package verification errors', () => {
    it('should handle package not found', async () => {
      const mockPackageStatus = {
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Package not found')
      };

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);

      const [, , callback] = getComponentSourceCode();

      await expect(callback({ componentName: 'Button' })).rejects.toThrow(McpError);
      await expect(callback({ componentName: 'Button' })).rejects.toThrow('Package "@patternfly/react-core" not found locally');
    });
  });

  describe('component resolution errors', () => {
    it('should handle component not found in modules map', async () => {
      const mockPackageStatus = {
        exists: true,
        version: '1.0.0',
        packageRoot: '/test/node_modules/@patternfly/react-core'
      };
      const mockModulesMap = {
        Card: 'dist/dynamic/components/Card'
      };

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);
      mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);

      const [, , callback] = getComponentSourceCode();

      await expect(callback({ componentName: 'Button' })).rejects.toThrow(McpError);
      await expect(callback({ componentName: 'Button' })).rejects.toThrow('No valid path to "Button" found');
    });

    it('should handle import line not found in index file', async () => {
      const mockPackageStatus = {
        exists: true,
        version: '1.0.0',
        packageRoot: '/test/node_modules/@patternfly/react-core'
      };
      const mockModulesMap = {
        Button: 'dist/dynamic/components/Button'
      };
      const mockIndexSource = `export * from './Card';`; // Different component - no Button export

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);
      mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);
      mockReadFileAsync.mockResolvedValue(mockIndexSource);

      const [, , callback] = getComponentSourceCode();

      await expect(callback({ componentName: 'Button' })).rejects.toThrow(McpError);
      await expect(callback({ componentName: 'Button' })).rejects.toThrow('Failed to find source code for component "Button"');
    });

    it('should handle both .ts and .tsx files not found', async () => {
      const mockPackageStatus = {
        exists: true,
        version: '1.0.0',
        packageRoot: '/test/node_modules/@patternfly/react-core'
      };
      const mockModulesMap = {
        Button: 'dist/dynamic/components/Button'
      };
      const mockIndexSource = `export * from './Button';`;

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);
      mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);
      mockReadFileAsync
        .mockImplementation(filePath => {
          // @ts-ignore
          if (filePath.includes('index.ts')) {
            return Promise.resolve(mockIndexSource);
          }

          return Promise.reject(new Error('File not found'));
        });

      const [, , callback] = getComponentSourceCode();

      await expect(callback({ componentName: 'Button' })).rejects.toThrow(McpError);
      await expect(callback({ componentName: 'Button' })).rejects.toThrow('Failed to read source code file for component "Button"');
    });
  });

  describe('path handling', () => {
    it('should correctly transform dist/dynamic path to src path', async () => {
      const mockPackageStatus = {
        exists: true,
        version: '1.0.0',
        packageRoot: '/test/node_modules/@patternfly/react-core'
      };
      const mockModulesMap = {
        Button: 'dist/dynamic/components/Button'
      };

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);
      mockGetLocalModulesMap.mockResolvedValue(mockModulesMap);

      const [, , callback] = getComponentSourceCode();

      // This will fail at readFileAsync but we can verify the path transformation logic
      try {
        await callback({ componentName: 'Button' });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Expected to fail, but we can verify the calls
      }

      // Should read from src path, not dist path
      expect(mockReadFileAsync).toHaveBeenCalledWith(
        '/test/node_modules/@patternfly/react-core/src/components/Button/index.ts',
        'utf-8'
      );
    });
  });

  describe('always targets @patternfly/react-core', () => {
    it('should always use @patternfly/react-core package', async () => {
      const mockPackageStatus = {
        exists: true,
        version: '1.0.0',
        packageRoot: '/test/path'
      };

      mockVerifyLocalPackage.mockResolvedValue(mockPackageStatus);
      mockGetLocalModulesMap.mockResolvedValue({});

      const [, , callback] = getComponentSourceCode();

      try {
        await callback({ componentName: 'Button' });
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        // Expected to fail due to empty modules map
      }

      expect(mockVerifyLocalPackage).toHaveBeenCalledWith('@patternfly/react-core');
      expect(mockGetLocalModulesMap).toHaveBeenCalledWith('@patternfly/react-core');
    });
  });
});
