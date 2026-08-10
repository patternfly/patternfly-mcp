import { applyStaticProperty, getSetMemoKey } from '../server.processUser';

describe('applyStaticProperty', () => {
  it.each([
    {
      description: 'object',
      obj: {},
      value: 'lorem',
      name: 'ipsum',
      expected: true
    },
    {
      description: 'function',
      obj: () => {},
      value: 'lorem',
      name: 'ipsum',
      expected: true
    }
  ])('should apply a property, $description', ({ name, value, obj, expected }) => {
    const result = applyStaticProperty(name, value, obj);

    expect(result).toBe(expected);
    expect((obj as any)?.[name]).toBe(value);

    const descriptor = Object.getOwnPropertyDescriptor(obj, name);

    expect(descriptor).toBeDefined();
    expect(descriptor?.value).toBe(value);
    expect(descriptor?.writable).toBe(false);
    expect(descriptor?.enumerable).toBe(false);
    expect(descriptor?.configurable).toBe(false);
  });

  it.each([
    {
      description: 'null',
      obj: null,
      value: 'lorem',
      name: 'ipsum',
      expected: false
    },
    {
      description: 'undefined',
      obj: undefined,
      value: 'lorem',
      name: 'ipsum',
      expected: false
    }
  ])('should fail to apply a property, $description', ({ name, value, obj, expected }) => {
    const result = applyStaticProperty(name, value, obj);

    expect(result).toBe(expected);
  });

  it('should return false when trying to overwrite a non-configurable property', () => {
    const obj = {};

    Object.defineProperty(obj, 'fixedProp', {
      value: 'original',
      writable: false,
      configurable: false
    });

    const result = applyStaticProperty('fixedProp', 'newVal', obj);

    expect(result).toBe(false);
  });
});

describe('getSetMemoKey', () => {
  it.each([
    {
      description: 'string',
      input: 'myString',
      contextKey: 'ctx',
      expected: 'myString:ctx'
    },
    {
      description: 'number',
      input: 42,
      contextKey: 'ctx',
      expected: '42:ctx'
    },
    {
      description: 'boolean',
      input: true,
      contextKey: 'ctx',
      expected: 'true:ctx'
    },
    {
      description: 'null',
      input: null,
      contextKey: 'ctx',
      expected: 'null:ctx'
    },
    {
      description: 'undefined',
      input: undefined,
      contextKey: 'ctx',
      expected: 'undefined:ctx'
    }
  ])('should return format "input:contextKey", $description', ({ input, contextKey, expected }) => {
    const result = getSetMemoKey(input, contextKey);

    expect(result).toBe(expected);
  });

  it('should handle symbol primitives by converting to string representation', () => {
    const sym = Symbol('testSym');
    const result = getSetMemoKey(sym, 'ctx');

    expect(result).toBe('Symbol(testSym):ctx');
  });

  it.each([
    {
      description: 'object',
      input: {}
    },
    {
      description: 'function',
      input: () => {}
    }
  ])('should return a Symbol with plugins:contextKey description, $description', ({ input }) => {
    const result = getSetMemoKey(input, 'someCtx');

    expect(typeof result).toBe('symbol');
    expect((result as symbol).description).toBe('plugins:someCtx');
  });

  it.each([
    {
      description: 'object',
      createRef: () => ({})
    },
    {
      description: 'function',
      createRef: () => () => {}
    }
  ])('should handle uniqueness and memoization for references, $description', ({ createRef }) => {
    const ref1 = createRef();
    const ref2 = createRef();

    const token1 = getSetMemoKey(ref1, 'myKey');
    const token2 = getSetMemoKey(ref1, 'myKey');

    expect(token1).toBe(token2);

    const token3 = getSetMemoKey(ref2, 'myKey');

    expect(token1).not.toBe(token3);

    const token4 = getSetMemoKey(ref1, 'otherKey');

    expect(token1).not.toBe(token4);
  });
});
