import {
  renderClientResourceText,
  parseResourceLinks,
  runClient
} from '../client';

const mockConnect = jest.fn();
const mockCallTool = jest.fn();
const mockReadResource = jest.fn();
const mockClientClose = jest.fn();
const mockRunInteractiveClient = jest.fn().mockResolvedValue(undefined);

jest.mock('../client.screens', () => ({
  ...jest.requireActual('../client.screens'),
  runInteractiveClient: (...args: unknown[]) => mockRunInteractiveClient(...args)
}));

jest.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    connect: mockConnect,
    callTool: mockCallTool,
    readResource: mockReadResource,
    close: mockClientClose
  }))
}));

jest.mock('../mcpSdk', () => {
  const actual = jest.requireActual('../mcpSdk');

  return {
    ...actual,
    McpClient: jest.requireMock('@modelcontextprotocol/sdk/client/index.js').Client
  };
});

describe('renderClientResourceText', () => {
  it('joins multiple text contents', () => {
    expect(renderClientResourceText([
      { uri: 'a', mimeType: 'text/markdown', text: 'Part one' },
      { uri: 'b', mimeType: 'text/markdown', text: 'Part two' }
    ])).toBe('Part one\n\n---\n\nPart two');
  });

  it('returns guidance when no text is present', () => {
    expect(renderClientResourceText([])).toContain('No readable text');
  });

  it('decodes base64 blob content items', () => {
    const blobBase64 = Buffer.from('Decoded blob markdown').toString('base64');
    const text = renderClientResourceText([{ uri: 'test://blob', mimeType: 'text/plain', blob: blobBase64 }]);

    expect(text).toBe('Decoded blob markdown');
  });

  it('handles invalid base64 blob gracefully with guidance fallback', () => {
    jest.spyOn(Buffer, 'from').mockImplementationOnce(() => {
      throw new Error('decode error');
    });
    const text = renderClientResourceText([{ uri: 'test://bad-blob', mimeType: 'application/octet-stream', blob: '%%%' }]);

    expect(text).toContain('[Binary resource blob');
  });
});

describe('parseResourceLinks', () => {
  it('maps resource_link content entries', () => {
    const links: any[] = parseResourceLinks({
      content: [
        { type: 'text', text: 'summary' },
        {
          type: 'resource_link',
          uri: 'patternfly://records/abc',
          name: 'Modal — Docs',
          description: 'Modal documentation',
          groupId: 'modal',
          primaryCollection: 'patternfly-docs'
        } as any
      ]
    });

    expect(links).toEqual([
      {
        uri: 'patternfly://records/abc',
        name: 'Modal — Docs',
        description: 'Modal documentation',
        groupId: 'modal',
        primaryCollection: 'patternfly-docs'
      }
    ]);
  });

  it('returns an empty list when content is missing', () => {
    expect(parseResourceLinks({ content: [] })).toEqual([]);
  });
});

describe('runClient', () => {
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockServer = { connect: jest.fn().mockResolvedValue(undefined) };
  });

  it('connects to the provided mcpChannel directly', async () => {
    await runClient(
      { name: 'test-client' } as any,
      { server: mockServer } as any
    );

    expect(mockRunInteractiveClient).toHaveBeenCalled();
    expect(mockServer.connect).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
  });

  it('calls searchPatternFly and maps links', async () => {
    mockCallTool.mockResolvedValue({
      content: [{
        type: 'resource_link',
        uri: 'patternfly://docs/button',
        name: 'Button'
      }]
    });

    const session = await runClient(undefined, { server: mockServer } as any);

    const results = await session.search('button');

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'searchPatternFly',
      arguments: { query: 'button' }
    });
    expect(results[0]?.uri).toBe('patternfly://docs/button');
  });

  it('passes collection filter when provided to search', async () => {
    mockCallTool.mockResolvedValue({
      content: [{
        type: 'resource_link',
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs',
        groupId: 'modal',
        primaryCollection: 'patternfly-docs'
      }]
    });

    const session = await runClient(undefined, { server: mockServer } as any);

    const results = await session.search('modal', 'patternfly-docs');

    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'searchPatternFly',
      arguments: { query: 'modal', collection: 'patternfly-docs' }
    });
    expect(results[0]?.groupId).toBe('modal');
    expect(results[0]?.primaryCollection).toBe('patternfly-docs');
  });

  it('extracts groupId, recordId, and primaryCollection from _meta payload', async () => {
    mockCallTool.mockResolvedValueOnce({
      content: [
        {
          type: 'resource_link',
          uri: 'patternfly://docs/modal-acc',
          name: 'Modal - Accessibility (v6)',
          _meta: {
            recordId: 'modal-acc-id',
            groupId: 'modal-hash-123',
            primaryCollection: 'patternfly-docs'
          }
        }
      ]
    });

    const session = await runClient(undefined, { server: mockServer } as any);

    const items = await session.search('modal');

    expect(items).toHaveLength(1);
    expect(items[0]?.recordId).toBe('modal-acc-id');
    expect(items[0]?.groupId).toBe('modal-hash-123');
    expect(items[0]?.primaryCollection).toBe('patternfly-docs');
  });

  it('reads resource text from the first content item', async () => {
    mockReadResource.mockResolvedValue({
      contents: [{ uri: 'patternfly://docs/button', text: '# Button\n\nDocs body' }]
    });

    const session = await runClient(undefined, { server: mockServer } as any);

    await expect(session.readResource('patternfly://docs/button')).resolves.toEqual({
      text: '# Button\n\nDocs body',
      truncated: false
    });
  });

  it('returns fallback guidance when readResource fails', async () => {
    mockReadResource.mockRejectedValueOnce(new Error('Connection dropped'));

    const session = await runClient(undefined, { server: mockServer } as any);
    const result = await session.readResource('patternfly://docs/missing');

    expect(result.text).toContain('# Unable to read resource');
    expect(result.text).toContain('Connection dropped');
    expect(result.truncated).toBe(false);
  });

  it('returns collection names via listCollections', async () => {
    const session = await runClient(undefined, { server: mockServer } as any);
    const collections = session.listCollections();

    expect(Array.isArray(collections)).toBe(true);
  });

  it('handles client close and isConnected status', async () => {
    const session = await runClient(undefined, { server: mockServer } as any);

    expect(mockConnect).toHaveBeenCalled();

    await session.close();
    expect(mockClientClose).toHaveBeenCalled();
    expect(session.isConnected()).toBe(false);
  });
});
