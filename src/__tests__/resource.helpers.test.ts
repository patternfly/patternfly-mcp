import {
  contentType,
  formatContentForMarkdown,
  isCssLike,
  isJavaLike,
  isJsLike,
  isJson,
  isJsonLike,
  isMarkdown,
  isPythonLike,
  isScriptLike,
  isShellLike,
  isXmlLike,
  paramCompletion
} from '../resource.helpers';
import { filterPatternFly } from '../patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from '../patternFly.helpers';

jest.mock('../patternFly.search', () => ({
  ...jest.requireActual('../patternFly.search'),
  filterPatternFly: { memo: jest.fn() }
}));

jest.mock('../patternFly.helpers', () => ({
  ...jest.requireActual('../patternFly.helpers'),
  normalizeEnumeratedPatternFlyVersion: { memo: jest.fn() }
}));

const MockFilter = filterPatternFly.memo as jest.MockedFunction<typeof filterPatternFly.memo>;
const MockNormalizeVersion = normalizeEnumeratedPatternFlyVersion.memo as jest.MockedFunction<typeof normalizeEnumeratedPatternFlyVersion.memo>;

describe('isCssLike', () => {
  it.each([
    {
      description: 'selector with braces', input: 'button { color: red; }', expected: true
    },
    {
      description: '@media rule', input: '@media (max-width:600px) {}', expected: true
    },
    {
      description: 'property declaration only', input: 'color: #fff;', expected: false
    },
    {
      description: 'url usage', input: 'background-image:url("foo.png");', expected: false
    },
    {
      description: 'non‑CSS string', input: 'Hello world', expected: false
    }
  ])('should detect CSS‑like syntax, $description', ({ input, expected }) => {
    expect(isCssLike(input)).toBe(expected);
  });
});

describe('isJson', () => {
  it.each([
    {
      description: 'valid JSON string', input: '{"a":1,"b":"x"}', expected: true
    },
    {
      description: 'object value', input: { a: 1 }, expected: true
    },
    {
      description: 'array value', input: [1, 2], expected: true
    },
    {
      description: 'empty array with allowEmpty=false', input: '[]', options: { allowEmpty: false }, expected: false
    },
    {
      description: 'empty object with allowEmpty=false', input: '{}', options: { allowEmpty: false }, expected: false
    },
    {
      description: 'empty array by default (allowEmpty=true)', input: '[]', expected: true
    },
    {
      description: 'empty object by default (allowEmpty=true)', input: '{}', expected: true
    },
    {
      description: 'non‑JSON string', input: 'not json', expected: false
    },
    {
      description: 'non‑JSON number', input: 42 as any, expected: false
    }
  ])('should validate JSON, $description', ({ input, options, expected }) => {
    expect(isJson(input, options)).toBe(expected);
  });
});

describe('isJsonLike', () => {
  it.each([
    {
      description: 'object string', input: '{"a":1}', expected: true
    },
    {
      description: 'array string', input: '[1,2]', expected: true
    },
    {
      description: 'real object', input: { a: 1 }, expected: true
    },
    {
      description: 'real array', input: [1, 2], expected: true
    },
    {
      description: 'missing quotes', input: '{a:1}', expected: true
    },
    {
      description: 'non‑JSON string', input: 'hello', expected: false
    },
    {
      description: 'non‑JSON number', input: 42 as any, expected: false
    }
  ])('should detect JSON‑like values, $description', ({ input, expected }) => {
    expect(isJsonLike(input)).toBe(expected);
  });
});

describe('isMarkdown', () => {
  it.each([
    {
      description: 'heading', input: '# Title', expected: true
    },
    {
      description: 'blockquote', input: '> Quote', expected: true
    },
    {
      description: 'unordered list', input: '- item', expected: true
    },
    {
      description: 'ordered list', input: '1. first', expected: true
    },
    {
      description: 'link', input: '[Google](https://google.com)', expected: true
    },
    {
      description: 'image', input: '![alt](img.png)', expected: true
    },
    {
      description: 'fenced code block', input: '```js\nconst a=1;\n```', expected: true
    },
    {
      description: 'table', input: '| Header |\n|--------|\n| Cell   |', expected: false
    },
    {
      description: 'plain text', input: 'Just a sentence.', expected: false
    }
  ])('should detect markdown, $description', ({ input, expected }) => {
    expect(isMarkdown(input)).toBe(expected);
  });
});

describe('isXmlLike', () => {
  it.each([
    {
      description: 'HTML document', input: `<html><body>Hello</body></html>`, expected: true
    },
    {
      description: 'SVG document', input: `<svg xmlns="http://www.w3.org/2000/svg"><circle/></svg>`, expected: true
    },
    {
      description: 'mismatched tags', input: '<div><span></div>', expected: true
    },
    {
      description: 'non‑XML code', input: 'console.log("hi")', expected: false
    }
  ])('should detect XML/HTML, $description', ({ input, expected }) => {
    expect(isXmlLike(input)).toBe(expected);
  });
});

describe('isJavaLike', () => {
  it.each([
    {
      description: 'class declaration', input: `public class Foo { }`, expected: true
    },
    {
      description: 'package statement', input: `package com.example;`, expected: true
    },
    {
      description: 'main method',
      input: `
      public static void main(String[] args) {
          System.out.println("hi");
      }
    `,
      expected: true
    },
    {
      description: 'non‑Java code', input: 'console.log("hi")', expected: false
    }
  ])('should detect Java‑like code, $description', ({ input, expected }) => {
    expect(isJavaLike(input)).toBe(expected);
  });
});

describe('isJsLike', () => {
  it.each([
    {
      description: 'shebang', input: `#!/usr/bin/env node`, expected: true
    },
    {
      description: 'ESM import/export', input: `import foo from 'bar'; export default foo;`, expected: true
    },
    {
      description: 'CommonJS module.exports', input: `module.exports = function(){}`, expected: true
    },
    {
      description: 'TypeScript interface', input: `interface Foo { bar: string }`, expected: true
    },
    {
      description: 'React hook + JSX', input: `const Comp = () => { useEffect(()=>{},[]); return <div/> };`, expected: true
    },
    {
      description: 'plain text', input: 'Hello world', expected: false
    }
  ])('should detect JS/TS/JSX code, $description', ({ input, expected }) => {
    expect(isJsLike(input)).toBe(expected);
  });
});

describe('isPythonLike', () => {
  it.each([
    { description: 'shebang', input: `#!/usr/bin/env python`, expected: true },
    { description: 'function definition', input: `def foo(x): return x*2`, expected: true },
    { description: 'class definition', input: `class Bar: pass`, expected: true },
    {
      description: 'if __name__ block',
      input: `
      if __name__ == "__main__":
          print("run")
    `,
      expected: true
    },
    { description: 'non‑Python code', input: `console.log("hi")`, expected: false }
  ])('should  detects python like scripts, $description', ({ input, expected }) => {
    expect(isPythonLike(input)).toBe(expected);
  });
});

describe('isShellLike', () => {
  it.each([
    {
      description: 'shebang', input: `#!/usr/bin/env bash`, expected: true
    },
    {
      description: 'env variable export', input: `export PATH=/foo:$PATH`, expected: true
    },
    {
      description: 'control flow block', input: `if [[ $x -gt 0 ]]; then echo hi; fi`, expected: true
    },
    {
      description: 'function definition', input: `myfunc() { echo "ok"; }`, expected: true
    },
    {
      description: 'non‑shell code', input: `print("hi")`, expected: false
    }
  ])('should detect shell like scripts, $description', ({ input, expected }) => {
    expect(isShellLike(input)).toBe(expected);
  });
});

describe('isScriptLike', () => {
  it.each([
    {
      description: 'Java', input: 'protected class X{}', expected: true
    },
    {
      description: 'JS', input: `console.log('hi'); module.exports=test`, expected: true
    },
    {
      description: 'Python', input: `def f(): pass`, expected: true
    },
    {
      description: 'Shell', input: `#! bash echo hi;`, expected: true
    },
    {
      description: 'XML', input: `<html></html>`, expected: false
    },
    {
      description: 'CSS', input: `body{margin:0;}`, expected: false
    },
    {
      description: 'Markdown', input: `# Title`, expected: false
    },
    {
      description: 'JSON', input: '{"a":1}', expected: false
    }
  ])('should detect script content, $description', ({ input, expected }) => {
    expect(isScriptLike(input)).toBe(expected);
  });
});

describe('contentType', () => {
  it.each([
    {
      description: 'markdown', input: '# Title', expected: 'markdown'
    },
    {
      description: 'json string', input: '{"a":1}', expected: 'json'
    },
    {
      description: 'xml/html', input: '<div></div>', expected: 'html'
    },
    {
      description: 'javascript', input: `console.log(42); module.exports=test`, expected: 'javascript'
    },
    {
      description: 'shell', input: `#!/bin/bash\necho hi`, expected: 'sh'
    },
    {
      description: 'python', input: `def f(): pass`, expected: 'python'
    },
    {
      description: 'java', input: `public class X{}`, expected: 'java'
    },
    {
      description: 'css', input: `.foo{}`, expected: 'css'
    }
  ])('should detect, $description', ({ input, expected }) => {
    expect(contentType(input)).toBe(expected);
  });

  it('should return empty strings for null/empty values', () => {
    expect(contentType(null as any)).toBe('');
    expect(contentType(undefined as any)).toBe('');
    expect(contentType('').trim()).toBe('');
  });
});

describe('formatContentForMarkdown', () => {
  const json = '{"a":1,"b":[2,3]}';
  const js = `cons` + `ole.log(42); module.exports=test`;

  it('should wrap non‑markdown content in a code block', () => {
    expect(formatContentForMarkdown(js)).toMatch(/^```javascript\n/);
  });

  it('should pretty‑print JSON when language is JSON', () => {
    const formatted = formatContentForMarkdown(json, { langOverride: 'json' });

    expect(formatted).toContain('\n{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
  });

  it('should not wrap markdown unless overridden', () => {
    const md = '# Title';

    expect(formatContentForMarkdown(md)).toBe('# Title'); // no wrapping
    expect(formatContentForMarkdown(md, { langOverride: 'js' })).toMatch(/^```js\n/);
  });

  it('should wrap markdown with the allowWrappingMarkdown flag', () => {
    const md = '- item';

    expect(formatContentForMarkdown(md, { allowWrappingMarkdown: true }))
      .toMatch(/^```markdown\n- item\n```$/); // wrapped as plain code
  });
});

describe('paramCompletion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([
    {
      description: 'aggregates, sorts, and de-duplicates fields',
      version: 'v6',
      byEntry: [
        { name: 'Table', category: 'data', section: 'components', version: 'v6', uriSchemas: 'patternfly://schemas/v6/table' },
        { name: 'Button', category: 'actions', section: 'components', version: 'v6', uriSchemas: undefined },
        { name: 'Button', category: 'actions', section: 'components', version: 'v6', uriSchemas: undefined }
      ],
      expected: {
        names: ['Button', 'Table'],
        categories: ['actions', 'data'],
        sections: ['components'],
        versions: ['v6'],
        schemas: ['Table']
      }
    },
    {
      description: 'returns empty arrays when there are no entries',
      version: undefined,
      byEntry: [],
      expected: { names: [], categories: [], sections: [], versions: [], schemas: [] }
    },
    {
      description: 'skips non-string fields',
      version: 'v6',
      byEntry: [
        { name: 123, category: null, section: undefined, version: 'v6', uriSchemas: 'x' }
      ],
      expected: { names: [], categories: [], sections: [], versions: ['v6'], schemas: [] }
    }
  ])('should return completion sets, $description', async ({ version, byEntry, expected }) => {
    MockFilter.mockResolvedValue({ byEntry, byResource: new Map() } as any);

    const result = await paramCompletion({ version, category: '', section: 'components' });

    expect(MockNormalizeVersion).toHaveBeenCalledWith(version);
    expect(result).toEqual(expected);
  });

  it('should normalize the version and forward filters to filterPatternFly', async () => {
    MockNormalizeVersion.mockResolvedValue('v6' as any);
    MockFilter.mockResolvedValue({ byEntry: [], byResource: new Map() } as any);

    await paramCompletion({ version: 'latest', category: 'button', section: 'components' });

    expect(MockNormalizeVersion).toHaveBeenCalledWith('latest');
    expect(MockFilter).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'button', section: 'components', version: 'v6' })
    );
  });

  it('should fall back to the raw filters.version when normalization returns falsy', async () => {
    MockFilter.mockResolvedValue({ byEntry: [], byResource: new Map() } as any);

    await paramCompletion({ version: 'v6', section: 'components' });

    expect(MockFilter).toHaveBeenCalledWith(
      expect.objectContaining({ version: 'v6' })
    );
  });
});
