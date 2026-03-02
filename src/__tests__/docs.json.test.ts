import docs from '../docs.json';

describe('docs.json', () => {
  it('should have metadata reflective of its JSON content', () => {
    expect(docs.meta.totalEntries).toBeDefined();
    expect(Object.entries(docs.docs).length).toBe(docs.meta.totalEntries);

    expect(docs.meta.totalDocs).toBeDefined();

    let totalDocs = 0;

    Object.values(docs.docs).forEach(entries => {
      if (Array.isArray(entries)) {
        totalDocs += entries.length;
      }
    });

    expect(totalDocs).toBe(docs.meta.totalDocs);
  });
});
