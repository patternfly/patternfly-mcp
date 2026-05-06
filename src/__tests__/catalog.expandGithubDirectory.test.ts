import { expandGithubDirectoryInCatalog } from '../catalog.expandGithubDirectory';
import type { PatternFlyMcpDocsCatalogSource } from '../docs.embedded';

describe('expandGithubDirectoryInCatalog', () => {
  it('should reject expansion for repos outside the allowlist', async () => {
    const catalog: PatternFlyMcpDocsCatalogSource = {
      version: '1',
      generated: new Date().toISOString(),
      meta: {
        totalEntries: 1,
        totalDocs: 1,
        source: 'test'
      },
      docs: {
        BadExpand: [
          {
            displayName: 'Invalid',
            description: 'Should fail',
            pathSlug: 'invalid',
            section: 'guidelines',
            category: 'ai',
            source: 'github',
            version: 'v6',
            expandGithubDirectory: {
              owner: 'disallowed',
              repo: 'vendor',
              ref: 'main',
              directoryPath: 'docs'
            }
          }
        ]
      }
    };

    await expect(expandGithubDirectoryInCatalog(catalog)).rejects.toThrow(/not enabled/);
  });
});
