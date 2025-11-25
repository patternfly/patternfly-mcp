import { verifyLocalPackage } from '../utils.verifyLocalPackage';
import { readJsonFile } from '../utils.readFile';
import { resolveModule } from '../utils.moduleResolver';

// Mock dependencies
jest.mock('../utils.readFile');
jest.mock('../utils.moduleResolver'); // This will use the __mocks__ version

const mockReadJsonFile = readJsonFile as jest.MockedFunction<typeof readJsonFile>;
const mockResolveModule = resolveModule as jest.MockedFunction<typeof resolveModule>;

describe('verifyLocalPackage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock process.cwd to return a consistent value for testing
    jest.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('input validation', () => {
    it('should return error for undefined package name', async () => {
      const result = await verifyLocalPackage(undefined as any);

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Invalid package name: undefined')
      });
    });

    it('should return error for null package name', async () => {
      const result = await verifyLocalPackage(null as any);

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Invalid package name: null')
      });
    });

    it('should return error for empty string package name', async () => {
      const result = await verifyLocalPackage('');

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Invalid package name: ')
      });
    });

    it('should return error for non-string package name', async () => {
      const result = await verifyLocalPackage(123 as any);

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Invalid package name: 123')
      });
    });
  });

  describe('successful package resolution', () => {
    it('should resolve package successfully with version', async () => {
      const packageData = { version: '1.2.3' };
      const packagePath = 'file:///test/project/node_modules/@patternfly/react-core/package.json';

      mockResolveModule.mockReturnValue(packagePath);
      mockReadJsonFile.mockResolvedValue(packageData);

      const result = await verifyLocalPackage('@patternfly/react-core');

      expect(mockResolveModule).toHaveBeenCalledWith('/test/project/node_modules/@patternfly/react-core/package.json');
      expect(mockReadJsonFile).toHaveBeenCalledWith('/test/project/node_modules/@patternfly/react-core/package.json');
      expect(result).toEqual({
        exists: true,
        version: '1.2.3',
        packageRoot: '/test/project/node_modules/@patternfly/react-core'
      });
    });

    it('should handle package without version field', async () => {
      const packageData = {};
      const packagePath = 'file:///test/project/node_modules/some-package/package.json';

      mockResolveModule.mockReturnValue(packagePath);
      mockReadJsonFile.mockResolvedValue(packageData);

      const result = await verifyLocalPackage('some-package');

      expect(result).toEqual({
        exists: true,
        version: '',
        packageRoot: '/test/project/node_modules/some-package'
      });
    });

    it('should handle scoped packages correctly', async () => {
      const packageData = { version: '2.0.0' };
      const packagePath = 'file:///test/project/node_modules/@scope/package-name/package.json';

      mockResolveModule.mockReturnValue(packagePath);
      mockReadJsonFile.mockResolvedValue(packageData);

      const result = await verifyLocalPackage('@scope/package-name');

      expect(mockResolveModule).toHaveBeenCalledWith('/test/project/node_modules/@scope/package-name/package.json');
      expect(result).toEqual({
        exists: true,
        version: '2.0.0',
        packageRoot: '/test/project/node_modules/@scope/package-name'
      });
    });

    it('should strip file:// protocol from paths', async () => {
      const packageData = { version: '1.0.0' };
      const packagePath = 'file:///some/path/node_modules/package/package.json';

      mockResolveModule.mockReturnValue(packagePath);
      mockReadJsonFile.mockResolvedValue(packageData);

      const result = await verifyLocalPackage('package');

      expect(mockReadJsonFile).toHaveBeenCalledWith('/some/path/node_modules/package/package.json');
      expect(result.packageRoot).toBe('/some/path/node_modules/package');
    });
  });

  describe('error handling', () => {
    it('should handle module resolution throwing error', async () => {
      const resolveError = new Error('Module not found');

      mockResolveModule.mockImplementation(() => {
        throw resolveError;
      });

      const result = await verifyLocalPackage('nonexistent-package');

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Error resolving package "nonexistent-package": Module not found')
      });
    });

    it('should handle readJsonFile throwing error', async () => {
      const packagePath = 'file:///test/project/node_modules/package/package.json';
      const readError = new Error('Permission denied');

      mockResolveModule.mockReturnValue(packagePath);
      mockReadJsonFile.mockRejectedValue(readError);

      const result = await verifyLocalPackage('package');

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Error resolving package "package": Permission denied')
      });
    });

    it('should handle non-Error objects being thrown', async () => {
      mockResolveModule.mockImplementation(() => {
        throw 'String error';
      });

      const result = await verifyLocalPackage('package');

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Error resolving package "package": String error')
      });
    });

    it('should handle null/undefined errors', async () => {
      mockResolveModule.mockImplementation(() => {
        throw null;
      });

      const result = await verifyLocalPackage('package');

      expect(result).toEqual({
        exists: false,
        version: '',
        packageRoot: '',
        error: new Error('Error resolving package "package": null')
      });
    });
  });

  describe('path resolution', () => {
    it('should use current working directory as project root', async () => {
      const packageData = { version: '1.0.0' };

      mockResolveModule.mockReturnValue('file:///test/project/node_modules/test/package.json');
      mockReadJsonFile.mockResolvedValue(packageData);

      await verifyLocalPackage('test');

      expect(mockResolveModule).toHaveBeenCalledWith('/test/project/node_modules/test/package.json');
    });

    it('should handle different working directories', async () => {
      jest.spyOn(process, 'cwd').mockReturnValue('/different/path');

      const packageData = { version: '1.0.0' };

      mockResolveModule.mockReturnValue('file:///different/path/node_modules/test/package.json');
      mockReadJsonFile.mockResolvedValue(packageData);

      await verifyLocalPackage('test');

      expect(mockResolveModule).toHaveBeenCalledWith('/different/path/node_modules/test/package.json');
    });
  });

  describe('return type structure', () => {
    it('should always return object with required properties', async () => {
      mockResolveModule.mockImplementation(() => {
        throw new Error('Test error');
      });

      const result = await verifyLocalPackage('test');

      expect(result).toHaveProperty('exists');
      expect(result).toHaveProperty('version');
      expect(result).toHaveProperty('packageRoot');
      expect(typeof result.exists).toBe('boolean');
      expect(typeof result.version).toBe('string');
      expect(typeof result.packageRoot).toBe('string');
    });
  });
});
