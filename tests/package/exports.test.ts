import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('package entry bundles', () => {
  const distDir = join(process.cwd(), 'dist');

  beforeAll(() => {
    if (!existsSync(distDir)) {
      throw new Error('dist/ not found. Run npm run build before build tests.');
    }
  });

  it('should keep worker threads out of index entry chunks', () => {
    const indexChunks = readdirSync(distDir).filter(file => /^index.*\.js$/.test(file));

    expect(indexChunks.length).toBeGreaterThan(0);

    indexChunks.forEach(file => {
      const content = readFileSync(join(distDir, file), 'utf8');

      expect(content).not.toContain('worker_threads');
    });
  });

  it('should emit a tools entry without worker threads', () => {
    const toolsEntry = join(distDir, 'tools.js');

    expect(existsSync(toolsEntry)).toBe(true);

    const content = readFileSync(toolsEntry, 'utf8');

    expect(content).not.toContain('worker_threads');
  });
});
