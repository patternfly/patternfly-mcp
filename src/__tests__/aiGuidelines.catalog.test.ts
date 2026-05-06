import { expandGithubDirectoryInCatalog } from '../catalog.expandGithubDirectory';
import type { PatternFlyMcpDocsCatalogSource } from '../docs.embedded';
import docsJson from '../docs.json';
import { installGithubFetchMock, restoreNativeFetch } from './fixtures/mockGithubFetch';

const FELT_RAW_PREFIX = 'https://raw.githubusercontent.com/project-felt/ai-guidelines/';

const EXPECTED_FILENAMES = [
  'ai-design-principles.md',
  'animation.md',
  'chatbot-avatars.md',
  'color.md',
  'iconography.md',
  'legal-requirements.md',
  'transparency-notices.md'
];

describe('AiGuidelines docs.json catalog', () => {
  beforeAll(() => installGithubFetchMock());
  afterAll(() => restoreNativeFetch());

  it('should expand directory stub into seven project-felt entries', async () => {
    const expanded = await expandGithubDirectoryInCatalog(docsJson as PatternFlyMcpDocsCatalogSource);
    const entries = expanded.docs.AiGuidelines;

    expect(entries).toBeDefined();
    expect(entries).toHaveLength(EXPECTED_FILENAMES.length);
    expect(expanded.meta.totalDocs).toBe(331);

    for (const entry of entries ?? []) {
      expect(entry.path.startsWith(FELT_RAW_PREFIX)).toBe(true);
      expect(entry.path.endsWith('.md')).toBe(true);
      expect(entry.version).toBe('v6');
    }

    const basenames = (entries ?? []).map(docEntry => docEntry.path.split('/').pop());

    expect(basenames.sort()).toEqual([...EXPECTED_FILENAMES].sort());
  });
});
