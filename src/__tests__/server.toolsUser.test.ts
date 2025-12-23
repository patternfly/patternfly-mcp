import { createMcpTool } from '../server.toolsUser';

describe('createMcpTool', () => {
  const mkSpec = (overrides = {}) => ({
    kind: 'handler',
    name: 'sum',
    description: 'Add two numbers',
    inputSchema: {
      type: 'object',
      required: ['a', 'b'],
      properties: { a: { type: 'number' }, b: { type: 'number' } }
    },
    handler: ({ a, b }: any) => a + b,
    ...overrides
  });

  it.each([
    { description: 'single spec', input: mkSpec(), expectedCount: 1, firstName: 'sum' },
    { description: 'array of specs', input: [mkSpec({ name: 'a' }), mkSpec({ name: 'b' })], expectedCount: 2, firstName: 'a' }
  ])('accepts object specs ($description)', ({ input, expectedCount, firstName }) => {
    const creators = createMcpTool(input as any) as any[];
    const arr = Array.isArray(creators) ? creators : [creators];

    expect(arr.length).toBe(expectedCount);

    const first = arr[0];

    expect(typeof first).toBe('function');

    const tuple = first();

    expect(Array.isArray(tuple)).toBe(true);
    expect(tuple[0]).toBe(firstName);
  });

  it.each([
    { description: 'missing name', input: mkSpec({ name: '' }) },
    { description: 'non-function handler', input: { ...mkSpec(), handler: 123 as any } }
  ])('throws on invalid spec ($description)', ({ input }) => {
    expect(() => createMcpTool(input as any)).toThrow(/createMcpTool:/);
  });
});
