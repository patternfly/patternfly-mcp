import { patternFlySchemasCollection, collectionCallback } from '../collection.patternFlySchemas';

jest.mock('../patternFly.helpers', () => ({
  getPatternFlyVersionContext: {
    memo: jest.fn().mockResolvedValue({ latestSchemasVersion: 'v6' })
  }
}));

jest.mock('@patternfly/patternfly-component-schemas/json', () => ({
  componentNames: ['Button', 'Card']
}));

describe('patternFlySchemasCollection', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return the correct collection name and configuration', () => {
    const [name, callback, config] = patternFlySchemasCollection();

    expect(name).toBe('patternfly-component-schemas');
    expect(callback).toBeDefined();
    expect(config?.isRequired).toBe(true);
  });
});

describe('collectionCallback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate schema records for components and match McpCollectionResult structure', async () => {
    const result = await collectionCallback();

    expect(result).toHaveProperty('records');
    expect(Array.isArray(result.records)).toBe(true);
    // Button, Card + Table (manual)
    expect(result.records.length).toBe(3);

    const buttonRecord = result.records.find(record => record.sourceId === 'button');

    expect(buttonRecord).toBeDefined();
    expect(buttonRecord).toMatchObject({
      id: 'schema::button',
      sourceId: 'button',
      sourceType: 'package',
      data: {
        button: [
          expect.objectContaining({
            displayName: 'Button',
            isSchemasAvailable: true,
            version: 'v6',
            source: 'schemas'
          })
        ]
      }
    });
  });

  it('should manually include the Table component with isSchemasAvailable: false', async () => {
    const result = await collectionCallback();

    const tableRecord = result.records.find(record => record.sourceId === 'table');

    expect(tableRecord).toBeDefined();
    expect(tableRecord?.data).toHaveProperty('table');
    const tableEntries = (tableRecord?.data as Record<string, any>).table;

    expect(tableEntries[0].isSchemasAvailable).toBe(false);
    expect(tableEntries[0].source).toBe('schemas');
  });

  it('should match snapshot for schema collection result', async () => {
    const result = await collectionCallback();

    expect(result).toMatchSnapshot();
  });
});
