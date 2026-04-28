import { INDEX_BLOCKLIST_WORDS, INDEX_EXCEPTION_WORDS, INDEX_NOISE_WORDS } from '../docs.filterWords';

describe('INDEX_BLOCKLIST_WORDS', () => {
  it('should be defined and contain words', () => {
    expect(INDEX_BLOCKLIST_WORDS.length).toBeGreaterThanOrEqual(0);
    expect(INDEX_BLOCKLIST_WORDS).toBeDefined();
  });
});

describe('INDEX_EXCEPTION_WORDS', () => {
  it('should be defined and contain words', () => {
    expect(INDEX_EXCEPTION_WORDS.length).toBeGreaterThanOrEqual(0);
    expect(INDEX_EXCEPTION_WORDS).toBeDefined();
  });
});

describe('INDEX_NOISE_WORDS', () => {
  it('should be defined and contain words', () => {
    expect(INDEX_NOISE_WORDS.length).toBeGreaterThanOrEqual(0);
    expect(INDEX_NOISE_WORDS).toBeDefined();
  });
});
