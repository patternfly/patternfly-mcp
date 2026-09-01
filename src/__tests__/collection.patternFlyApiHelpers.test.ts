import {
  calculateContentQualityScore,
  extractApiDescription,
  extractApiDisplayName,
  extractApiName,
  formatSlugToTitle,
  getApiFallbackDescription,
  getLiveExampleCount,
  hasEmptyFileCodeFence,
  hasLiveExample,
  isRawImport,
  normalizeSlug
} from '../collection.patternFlyApiHelpers';

describe('isRawImport', () => {
  it.each([
    {
      description: 'default import with ?raw query',
      input: "import Button from './Button.tsx?raw'",
      expected: true
    },
    {
      description: 'named import with ?raw query',
      input: "import { Button } from './Button.tsx?raw'",
      expected: true
    },
    {
      description: 'multiple named imports with ?raw query',
      input: "import { Button, Card, Modal } from './components?raw'",
      expected: true
    },
    {
      description: 'namespace import with ?raw query',
      input: "import * as React from './React?raw'",
      expected: true
    },
    {
      description: 'combined default and named imports with ?raw query',
      input: "import React, { useState } from './React?raw'",
      expected: true
    },
    {
      description: 'double quotes with ?raw query',
      input: 'import Button from "./Button.tsx?raw"',
      expected: true
    },
    {
      description: 'case-insensitive import statement with uppercase ?RAW',
      input: "IMPORT Button FROM './Button.tsx?RAW'",
      expected: true
    },
    {
      description: 'multiline import statement with ?raw query',
      input: "import {\n  Button,\n  Card\n} from './components?raw'",
      expected: true
    },
    {
      description: 'standard import without ?raw query',
      input: "import Button from './Button.tsx'",
      expected: false
    },
    {
      description: 'side-effect import without clause',
      input: "import './styles.css?raw'",
      expected: false
    },
    {
      description: 'string without import statement',
      input: 'const file = "./Button.tsx?raw";',
      expected: false
    },
    {
      description: 'empty string',
      input: '',
      expected: false
    }
  ])('should detect raw imports, $description', ({ input, expected }) => {
    expect(isRawImport(input)).toBe(expected);
  });
});

describe('hasLiveExample', () => {
  it.each([
    {
      description: 'self-closing LiveExample tag',
      input: '<LiveExample src="./Button.tsx" />',
      expected: true
    },
    {
      description: 'opening LiveExample tag with attributes',
      input: '<LiveExample id="example-1">',
      expected: true
    },
    {
      description: 'case-insensitive liveexample tag',
      input: '<liveexample src="demo" />',
      expected: true
    },
    {
      description: 'LiveExample tag with multiline attributes',
      input: '<LiveExample\n  src="./Demo.tsx"\n/>',
      expected: true
    },
    {
      description: 'LiveExample tag without attributes',
      input: '<LiveExample/>',
      expected: true
    },
    {
      description: 'text without LiveExample tag',
      input: '<div>Regular HTML component</div>',
      expected: false
    },
    {
      description: 'extended component name without word boundary match',
      input: '<LiveExampleExtended />',
      expected: false
    },
    {
      description: 'empty string',
      input: '',
      expected: false
    }
  ])('should detect LiveExample tags, $description', ({ input, expected }) => {
    expect(hasLiveExample(input)).toBe(expected);
  });
});

describe('getLiveExampleCount', () => {
  it.each([
    {
      description: 'zero occurrences in plain text',
      input: 'Plain text without examples',
      expected: 0
    },
    {
      description: 'single self-closing tag',
      input: '<LiveExample src="./Button.tsx" />',
      expected: 1
    },
    {
      description: 'multiple tags with mixed casing',
      input: '<LiveExample src="1" />\n<LiveExample src="2" />\n<liveexample src="3" />',
      expected: 3
    },
    {
      description: 'tag with child elements',
      input: '<LiveExample prop="a">child content</LiveExample>',
      expected: 1
    },
    {
      description: 'empty string',
      input: '',
      expected: 0
    }
  ])('should count LiveExample occurrences, $description', ({ input, expected }) => {
    expect(getLiveExampleCount(input)).toBe(expected);
  });
});

describe('hasEmptyFileCodeFence', () => {
  it.each([
    {
      description: 'empty code fence with file attribute',
      input: '```ts file="./ButtonBasic.tsx"\n```',
      expected: true
    },
    {
      description: 'empty code fence with file attribute and inner whitespace',
      input: '```tsx  file="./Button.tsx" \n   ```',
      expected: true
    },
    {
      description: 'empty code fence with language only',
      input: '```ts\n```',
      expected: true
    },
    {
      description: 'empty code fence with no language',
      input: '```\n```',
      expected: true
    },
    {
      description: 'empty code fence with trailing whitespace inside',
      input: '```js\n   \n```',
      expected: true
    },
    {
      description: 'non-empty code fence with file attribute',
      input: '```ts file="./Button.tsx"\nconst button = true;\n```',
      expected: false
    },
    {
      description: 'non-empty code fence with language',
      input: '```ts\nconst total = 42;\n```',
      expected: false
    },
    {
      description: 'plain text without code fences',
      input: 'Just regular documentation text',
      expected: false
    },
    {
      description: 'empty string',
      input: '',
      expected: false
    }
  ])('should detect empty file code fences, $description', ({ input, expected }) => {
    expect(hasEmptyFileCodeFence(input)).toBe(expected);
  });
});

describe('calculateContentQualityScore', () => {
  it.each([
    {
      description: 'undefined content returns baseScore',
      content: undefined,
      options: undefined,
      expected: 1
    },
    {
      description: 'null content returns baseScore',
      content: null,
      options: undefined,
      expected: 1
    },
    {
      description: 'boolean content returns baseScore',
      content: true,
      options: undefined,
      expected: 1
    },
    {
      description: 'empty string returns baseScore',
      content: '',
      options: undefined,
      expected: 1
    },
    {
      description: 'whitespace-only string returns baseScore',
      content: '   \n\t  ',
      options: undefined,
      expected: 1
    },
    {
      description: 'kind equals examples skips quality checks',
      content: 'short',
      options: { kind: 'examples' },
      expected: 1
    },
    {
      description: 'high quality content exceeding minimum characters',
      content: 'A'.repeat(200),
      options: undefined,
      expected: 1
    },
    {
      description: 'short content without code block receives length penalty',
      content: 'Short content description.',
      options: undefined,
      expected: 0.97
    },
    {
      description: 'short content with code block does not receive length penalty',
      content: 'Short:\n```ts\nconst value = 1;\n```',
      options: undefined,
      expected: 1
    },
    {
      description: 'invalid JSON-like content receives JSON penalty and length penalty',
      content: '{ invalid: json content }',
      options: undefined,
      expected: 0.94
    },
    {
      description: 'valid JSON content without length penalty when over minimum length',
      content: JSON.stringify({ description: 'A'.repeat(160) }),
      options: undefined,
      expected: 1
    },
    {
      description: 'content with raw import receives penalty',
      content: `import Button from './Button?raw';\n${'A'.repeat(160)}`,
      options: undefined,
      expected: 0.97
    },
    {
      description: 'content with multiple LiveExample tags reduces score per tag',
      content: `<LiveExample src="1" />\n<LiveExample src="2" />\n${'A'.repeat(160)}`,
      options: undefined,
      expected: 0.94
    },
    {
      description: 'content with empty file code fence over minimum characters',
      content: `${'A'.repeat(160)}\n\`\`\`ts file="./Button.tsx"\n\`\`\``,
      options: undefined,
      expected: 0.97
    },
    {
      description: 'content with empty file code fence under minimum characters receives double penalty',
      content: '```ts file="./Button.tsx"\n```',
      options: undefined,
      expected: 0.94
    },
    {
      description: 'numeric content converted to string and evaluated',
      content: 12345,
      options: undefined,
      expected: 0.97
    },
    {
      description: 'custom baseScore and qualityReduction options',
      content: 'Short text',
      options: { baseScore: 0.8, qualityReduction: 0.1 },
      expected: 0.7
    },
    {
      description: 'custom minCharacters option satisfied',
      content: 'A'.repeat(60),
      options: { minCharacters: 50 },
      expected: 1
    },
    {
      description: 'score clamped to 0 when penalties exceed baseScore',
      content: '{ invalid json }',
      options: { baseScore: 0.05, qualityReduction: 0.1 },
      expected: 0
    },
    {
      description: 'score clamped to 1 when baseScore exceeds 1',
      content: 'A'.repeat(200),
      options: { baseScore: 1.5 },
      expected: 1
    }
  ])('should calculate quality score, $description', ({ content, options, expected }: any) => {
    expect(calculateContentQualityScore(content, options)).toBe(expected);
  });
});

describe('normalizeSlug', () => {
  it.each([
    {
      description: 'PascalCase component name',
      input: 'Button',
      expected: 'button'
    },
    {
      description: 'multi-word PascalCase component name',
      input: 'ActionList',
      expected: 'action-list'
    },
    {
      description: 'multi-word PascalCase with three words',
      input: 'ModalBoxHeader',
      expected: 'modal-box-header'
    },
    {
      description: 'acronym exception CSS',
      input: 'CSS',
      expected: 'css'
    },
    {
      description: 'acronym exception HTML',
      input: 'HTML',
      expected: 'html'
    },
    {
      description: 'acronym exception AI',
      input: 'AI',
      expected: 'ai'
    },
    {
      description: 'acronym exception MCP',
      input: 'MCP',
      expected: 'mcp'
    },
    {
      description: 'acronym exception CLI',
      input: 'CLI',
      expected: 'cli'
    },
    {
      description: 'acronym exception UXD',
      input: 'UXD',
      expected: 'uxd'
    },
    {
      description: 'acronym exception UI',
      input: 'UI',
      expected: 'ui'
    },
    {
      description: 'acronym exception API',
      input: 'API',
      expected: 'api'
    },
    {
      description: 'acronym exception FAQ and FAQS',
      input: 'FAQS',
      expected: 'faqs'
    },
    {
      description: 'acronym exception ARIA',
      input: 'ARIA',
      expected: 'aria'
    },
    {
      description: 'acronym exception RTL',
      input: 'RTL',
      expected: 'rtl'
    },
    {
      description: 'already kebab-cased string',
      input: 'action-list',
      expected: 'action-list'
    },
    {
      description: 'snake_cased string',
      input: 'action_list_item',
      expected: 'action-list-item'
    },
    {
      description: 'mixed underscores and multiple hyphens',
      input: 'action__list--item_sub',
      expected: 'action-list-item-sub'
    },
    {
      description: 'leading and trailing whitespace',
      input: '  Button  ',
      expected: 'button'
    },
    {
      description: 'camelCase string with leading lowercase',
      input: 'actionList',
      expected: 'actionlist'
    },
    {
      description: 'empty string',
      input: '',
      expected: ''
    }
  ])('should normalize slug, $description', ({ input, expected }) => {
    expect(normalizeSlug(input)).toBe(expected);
  });
});

describe('formatSlugToTitle', () => {
  it.each([
    {
      description: 'empty slug returns default title',
      slug: '',
      section: undefined,
      expected: 'PatternFly API'
    },
    {
      description: 'single word slug',
      slug: 'button',
      section: undefined,
      expected: 'Button'
    },
    {
      description: 'kebab-case slug',
      slug: 'action-list',
      section: undefined,
      expected: 'Action List'
    },
    {
      description: 'slug with acronyms',
      slug: 'css-variables',
      section: undefined,
      expected: 'CSS Variables'
    },
    {
      description: 'slug with multiple acronyms',
      slug: 'html-and-css-api',
      section: undefined,
      expected: 'HTML And CSS API'
    },
    {
      description: 'slug with all supported acronyms',
      slug: 'ai-cli-mcp-uxd-ui-faq-faqs-aria-rtl',
      section: undefined,
      expected: 'AI CLI MCP UXD UI FAQ FAQS ARIA RTL'
    },
    {
      description: 'compound slug with underscore separator',
      slug: 'ai-assisted-development_ai-assisted-code-migration',
      section: undefined,
      expected: 'AI Assisted Development: AI Assisted Code Migration'
    },
    {
      description: 'compound slug with multiple underscore sections',
      slug: 'section-one_section-two_section-three',
      section: undefined,
      expected: 'Section One: Section Two: Section Three'
    },
    {
      description: 'overview slug with section',
      slug: 'overview',
      section: 'components',
      expected: 'Components Overview'
    },
    {
      description: 'overview slug with section containing acronym',
      slug: 'overview',
      section: 'ai-assist',
      expected: 'AI Assist Overview'
    },
    {
      description: 'overview slug with multi-word section',
      slug: 'overview',
      section: 'user-interface-patterns',
      expected: 'User Interface Patterns Overview'
    },
    {
      description: 'overview slug without section',
      slug: 'overview',
      section: undefined,
      expected: 'Overview'
    }
  ])('should format slug to title, $description', ({ slug, section, expected }) => {
    expect(formatSlugToTitle(slug, section)).toBe(expected);
  });
});

describe('extractApiDisplayName', () => {
  it.each([
    {
      description: 'props kind with valid JSON containing name property',
      content: JSON.stringify({ name: 'ButtonProps', props: {} }),
      context: { kind: 'props', slug: 'button-props' },
      expected: 'ButtonProps'
    },
    {
      description: 'props kind with valid JSON without name property falls back to slug',
      content: JSON.stringify({ props: {} }),
      context: { kind: 'props', slug: 'button-props' },
      expected: 'Button Props'
    },
    {
      description: 'props kind with invalid JSON falls back to slug',
      content: '{ invalid json',
      context: { kind: 'props', slug: 'button-props' },
      expected: 'Button Props'
    },
    {
      description: 'props kind with markdown H1 heading',
      content: '# Custom Button Props\nSome description',
      context: { kind: 'props', slug: 'button-props' },
      expected: 'Custom Button Props'
    },
    {
      description: 'css kind with slug not containing CSS appends CSS',
      content: '[]',
      context: { kind: 'css', slug: 'button', section: 'components' },
      expected: 'Button CSS'
    },
    {
      description: 'css kind with slug already containing CSS does not append CSS',
      content: '[]',
      context: { kind: 'css', slug: 'button-CSS', section: 'components' },
      expected: 'Button CSS'
    },
    {
      description: 'markdown content with H1 heading',
      content: '# Card Component\nDescription text',
      context: { slug: 'card' },
      expected: 'Card Component'
    },
    {
      description: 'markdown content with H1 Overview and section',
      content: '# Overview\nOverview body',
      context: { slug: 'overview', section: 'components' },
      expected: 'Components Overview'
    },
    {
      description: 'markdown content with H1 Overview without section',
      content: '# Overview\nOverview body',
      context: { slug: 'overview' },
      expected: 'Overview'
    },
    {
      description: 'markdown content without H1 heading falls back to slug',
      content: '## Subheading\nParagraph text without H1',
      context: { slug: 'data-list', section: 'components' },
      expected: 'Data List'
    },
    {
      description: 'empty content falls back to slug and section',
      content: '',
      context: { slug: 'alert-group', section: 'components' },
      expected: 'Alert Group'
    },
    {
      description: 'undefined content and undefined context returns default',
      content: undefined,
      context: undefined,
      expected: 'PatternFly API'
    },
    {
      description: 'null context explicitly passed returns default',
      content: undefined,
      context: null as any,
      expected: 'PatternFly API'
    }
  ])('should extract API display name, $description', ({ content, context, expected }: any) => {
    expect(extractApiDisplayName(content, context)).toBe(expected);
  });
});

describe('getApiFallbackDescription', () => {
  it.each([
    {
      description: 'props kind',
      displayName: 'Button',
      kind: 'props',
      expected: 'PatternFly React component props and TypeScript interfaces for Button.'
    },
    {
      description: 'css kind without css in displayName',
      displayName: 'Button',
      kind: 'css',
      expected: 'PatternFly CSS variables and tokens for Button.'
    },
    {
      description: 'css kind with uppercase CSS in displayName',
      displayName: 'Button CSS',
      kind: 'css',
      expected: 'PatternFly variables and tokens for Button CSS.'
    },
    {
      description: 'css kind with lowercase css in displayName',
      displayName: 'button css tokens',
      kind: 'css',
      expected: 'PatternFly variables and tokens for button css tokens.'
    },
    {
      description: 'html kind',
      displayName: 'Button',
      kind: 'html',
      expected: 'PatternFly HTML examples and markup structure for Button.'
    },
    {
      description: 'html-demos kind',
      displayName: 'Card',
      kind: 'html-demos',
      expected: 'PatternFly HTML examples and markup structure for Card.'
    },
    {
      description: 'react kind',
      displayName: 'Button',
      kind: 'react',
      expected: 'PatternFly React component examples and demos for Button.'
    },
    {
      description: 'react-demos kind',
      displayName: 'Modal',
      kind: 'react-demos',
      expected: 'PatternFly React component examples and demos for Modal.'
    },
    {
      description: 'examples kind',
      displayName: 'Button',
      kind: 'examples',
      expected: 'PatternFly Button examples and demos.'
    },
    {
      description: 'doc kind',
      displayName: 'Button',
      kind: 'doc',
      expected: 'PatternFly documentation and guidelines for Button.'
    },
    {
      description: 'unrecognized kind defaults to doc format',
      displayName: 'Button',
      kind: 'custom',
      expected: 'PatternFly documentation and guidelines for Button.'
    },
    {
      description: 'default arguments without parameters',
      displayName: undefined,
      kind: undefined,
      expected: 'PatternFly documentation and guidelines for .'
    }
  ])('should provide fallback description, $description', ({ displayName, kind, expected }: any) => {
    expect(getApiFallbackDescription(displayName, kind)).toBe(expected);
  });
});

describe('extractApiDescription', () => {
  it.each([
    {
      description: 'props kind returns fallback description',
      content: '# Title\nValid paragraph line exceeding twenty characters in length.',
      context: { displayName: 'Button', kind: 'props' },
      expected: 'PatternFly React component props and TypeScript interfaces for Button.'
    },
    {
      description: 'css kind returns fallback description',
      content: '# Title\nValid paragraph line exceeding twenty characters in length.',
      context: { displayName: 'Button', kind: 'css' },
      expected: 'PatternFly CSS variables and tokens for Button.'
    },
    {
      description: 'detailType equals examples returns fallback description',
      content: '# Title\nValid paragraph line exceeding twenty characters in length.',
      context: { displayName: 'Button', detailType: 'examples' },
      expected: 'PatternFly Button examples and demos.'
    },
    {
      description: 'markdown content extracts first valid prose paragraph',
      content: '# Button\n\nA button is a clickable interactive element that triggers an action.',
      context: { displayName: 'Button', kind: 'doc' },
      expected: 'A button is a clickable interactive element that triggers an action.'
    },
    {
      description: 'markdown formatting like bold, italics, inline code, and links are stripped',
      content: '# Title\n\nA **button** communicates an [action](https://patternfly.org) to be *performed* with `onClick`.',
      context: { displayName: 'Button', kind: 'doc' },
      expected: 'A button communicates an action to be performed with onClick.'
    },
    {
      description: 'HTML links and tags are stripped or converted to inner text',
      content: '# Title\n\nA <a href="link">button</a> with <span class="badge">badge</span> indicator.',
      context: { displayName: 'Button', kind: 'doc' },
      expected: 'A button with badge indicator.'
    },
    {
      description: 'trailing colon in paragraph is replaced with period',
      content: '# Title\n\nHere is a list of components and features available for use:',
      context: { displayName: 'Button', kind: 'doc' },
      expected: 'Here is a list of components and features available for use.'
    },
    {
      description: 'long paragraph exceeding 200 characters is truncated with ellipsis',
      content: `# Title\n\n${'This is a long description sentence describing the component. '.repeat(5)}`,
      context: { displayName: 'Button', kind: 'doc' },
      expected: `${'This is a long description sentence describing the component. '.repeat(5).trim().slice(0, 197)}...`
    },
    {
      description: 'content with imports and code blocks filtered out before extracting prose',
      content: "import React from 'react';\n```tsx\n<Button />\n```\n# Heading\n| table |\n\nA valid paragraph with more than twenty characters for description.",
      context: { displayName: 'Button', kind: 'doc' },
      expected: 'A valid paragraph with more than twenty characters for description.'
    },
    {
      description: 'content without valid prose paragraphs falls back to generated description',
      content: "import React from 'react';\n# Heading\nShort line",
      context: { displayName: 'Card', kind: 'doc' },
      expected: 'PatternFly documentation and guidelines for Card.'
    },
    {
      description: 'undefined content falls back to generated description',
      content: undefined,
      context: { displayName: 'Card', kind: 'doc' },
      expected: 'PatternFly documentation and guidelines for Card.'
    },
    {
      description: 'undefined content and undefined context returns default fallback description',
      content: undefined,
      context: undefined,
      expected: 'PatternFly documentation and guidelines for .'
    },
    {
      description: 'null context explicitly passed returns default fallback description',
      content: undefined,
      context: null as any,
      expected: 'PatternFly documentation and guidelines for .'
    }
  ])('should extract API description, $description', ({ content, context, expected }: any) => {
    expect(extractApiDescription(content, context)).toBe(expected);
  });
});

describe('extractApiName', () => {
  it.each([
    {
      description: 'components section returns normalized item name',
      item: 'Button',
      section: 'components',
      expected: 'button'
    },
    {
      description: 'components section with uppercase and whitespace',
      item: '  Card  ',
      section: '  Components  ',
      expected: 'card'
    },
    {
      description: 'overview item with custom section adds suffix',
      item: 'overview',
      section: 'utilities',
      expected: 'utilities-overview'
    },
    {
      description: 'item already prefixed with section avoids double prefix',
      item: 'charts-pie',
      section: 'charts',
      expected: 'charts-pie'
    },
    {
      description: 'item already prefixed with uppercase section name',
      item: 'Patterns-Gallery',
      section: 'patterns',
      expected: 'patterns-gallery'
    },
    {
      description: 'non-prefixed item in custom section prefixes section',
      item: 'pie',
      section: 'charts',
      expected: 'charts-pie'
    },
    {
      description: 'non-prefixed item in patterns section prefixes section',
      item: 'gallery',
      section: 'patterns',
      expected: 'patterns-gallery'
    }
  ])('should extract API name, $description', ({ item, section, expected }) => {
    expect(extractApiName(item, section)).toBe(expected);
  });
});
