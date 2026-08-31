import { filterPatternFly, type FilterPatternFlyFilters } from './patternFly.search';
import { normalizeEnumeratedPatternFlyVersion } from './patternFly.helpers';
import { isPlainObject } from './server.helpers';

/**
 * Is content CSS-like?
 *
 * CSS matching:
 * - Selector or `@` followed by an opening brace
 * - Common `@` rules (e.g., `@media`, `@keyframes`, `@import`)
 * - Sass, Less, and CSS variable declarations (e.g., `--color: red;`)
 * - Common HTML tag selectors (e.g., `body {`)
 * - Declaration blocks (e.g., `{ color: red; }`)
 *
 * @param content - Input value
 * @returns Returns `true` if the input matches CSS-like syntax.
 */
const isCssLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();

  const patterns = [
    /[.#&][\w-]+\s*\{/, // .class, #id, &nesting
    /@(media|keyframes|import|mixin|include)\b/i, // @rules / directives
    /(\$|@|--)[a-zA-Z_-][\w-]*\s*:/, // Sass, Less, CSS variables
    /\b(html|body|div|span|p|a)\s*\{/i, // common tag selectors
    /\{\s*[\w-]+\s*:\s*[^;{}]+;?\s*}/ // declaration blocks { prop: val; }
  ];

  return patterns.some(re => re.test(trimmed));
};

/**
 * Is a value JSON?
 *
 * @param content - Input value
 * @param options - Options
 * @param options.allowEmpty - Allow empty JSON objects/arrays as valid JSON.
 * @returns Return `true` if parsed and non‑empty.
 */
const isJson = (content: unknown, { allowEmpty = true }: { allowEmpty?: boolean } = {}): boolean => {
  try {
    const parsed = typeof content === 'string' ? JSON.parse(content.trim()) : content;

    if (Array.isArray(parsed)) {
      return allowEmpty ? true : parsed.length > 0;
    }
    if (isPlainObject(parsed)) {
      return allowEmpty ? true : Object.keys(parsed).length > 0;
    }

    return false;
  } catch {
    return false;
  }
};

/**
 * Simple is JSON-like guard.
 *
 * @param content - Input value
 * @returns Return `true` if starts, ends with braces/brackets, is an Array or Object.
 */
const isJsonLike = (content: unknown): boolean => {
  if (typeof content === 'string') {
    const trimmed = content.trim();

    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      const inner = trimmed.slice(1, -1).trim();

      // Empty object or array
      if (!inner) {
        return true;
      }

      const patterns = [
        /(['"])?[\w$-]+\1?\s*:/, // key: value, "key": value
        /(['"]).*\1/, // quoted strings
        /\b(true|false|null)\b/, // primitives
        /\b\d+(\.\d+)?\b/, // numbers
        /,/ // comma-separated items
      ];

      return patterns.some(re => re.test(inner));
    }
  }

  return Array.isArray(content) || isPlainObject(content);
};

/**
 * Is content a Markdown-formatted string?
 *
 * Markdown patterns:
 * - Headings (e.g., `# Heading`)
 * - Blockquote (e.g., `> Blockquote`)
 * - Unordered lists (e.g., `- Item`, `+ Item`, `* Item`)
 * - Ordered lists (e.g., `1. Item`, `2. Item`)
 * - Inline links (e.g., `[link](url)`)
 * - Images (e.g., `![alt text](url)`)
 * - Fenced code blocks
 *
 * @param content - Input value.
 * @returns Returns `true` if the input matches "common" Markdown patterns.
 */
const isMarkdown = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();

  if (/^#!\s*\S+/.test(trimmed)) {
    return false;
  }

  const patterns = [
    /^(#{1,6}\s)/m, // headings
    /^>\s/m, // blockquote
    /^[-+*]\s/m, // unordered list
    /^\d+\.\s/m, // ordered list
    /\[[^\]]+\]\([^)]+\)/, // inline link
    /!\[[^\]]*\]\([^)]+\)/, // image
    /^```/m, // fenced code block
    /^\s*\|(?:\s*:?-+:?\s*\|)+\s*$/m // table
  ];

  return patterns.some(re => re.test(content));
};

/**
 * Is content XML-like?
 *
 * XML matching:
 * - Start with an opening tag?
 * - Contains a corresponding closing tag?
 * - Matches common patterns in XML-like content. (e.g., HTML, SVG)
 *
 * @param content - Input value
 * @returns Returns `true` if the content is XML-like
 */
const isXmlLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }
  const trimmed = content.trim();

  // Must start with a tag
  if (!/^<\s*[!?\w]/i.test(trimmed)) {
    return false;
  }

  // Standalone tags
  if (/^<\s*([a-zA-Z][\w:-]*)(?:\s+[^>]*)?\s*\/>$/s.test(trimmed) || /<\s*[a-zA-Z][\w:-]*(?:\s+[^>]*)?\s*\/>/.test(trimmed)) {
    return true;
  }

  // Paired tags
  if (/<\/\s*[\w:-]+\s*>/.test(trimmed) && /^<\s*[a-zA-Z][\w:-]*/.test(trimmed)) {
    return true;
  }

  const indicators = [
    /<!DOCTYPE\s+[^>]+>/i,
    /<\?xml\b/i,
    /<html\b/i,
    /<body\b/i,
    /<div\b/i,
    /<svg\b/i,
    /<script\b/i,
    /<style\b/i
  ];

  return indicators.some(re => re.test(trimmed));
};

/**
 * Is content Java-like?
 *
 * Matching:
 * - Classes
 * - Package declarations
 * - Entry points
 *
 * @param content - Input value
 * @returns Returns `true` if the content is Java-like
 */
const isJavaLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }
  const trimmed = content.trim();

  const indicators = [
    /^\s*(public|private|protected)\s+(class|interface|enum|record)\s+\w+/m, // Class structure
    /^\s*package\s+[a-z0-9_]+(\.[a-z0-9_]+)*\s*;/m, // Package declarations
    /\b(public\s+static\s+void\s+main|System\.out\.print(ln)?)\b/ // Standard entry points
  ];

  const hasKeywords = () => /\b(system\.exit|yield|system\.out\.print)\b/i.test(trimmed);
  const structuralSymbols = () => (trimmed.match(/[{};=>]/g) || []).length > 2;

  return indicators.some(re => re.test(trimmed)) || (hasKeywords() && structuralSymbols());
};

/**
 * Is content JS-like?
 *
 * Matching:
 * - shebangs
 * - ESM
 * - CommonJS
 * - TS
 * - React
 * - JSX
 *
 * @param content - Input value
 * @returns Returns `true` if the content is JS-like
 */
const isJsLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }
  const trimmed = content.trim();

  const indicators = [
    /#!\s*.*\b(node|deno|bun)\b/, // shebangs
    /^\s*(import\s+([\w\s{},*]+|['"].+['"])\s+from\s+['"].+['"]|export\s+(default\s+)?(const|let|function|class|interface|type))/m, // ESM
    /\b(module\.exports\s*=|exports\.\w+\s*=|=\s*require\(['"].+['"]\))/, // CommonJS
    /^\s*(interface|type)\s+[A-Z]\w*\s*[{=]/m, // TS
    /\b(useState|useEffect|useContext|useRef|useMemo|useCallback)\(/, // React
    /return\s*\(\s*<[A-Za-z0-9_$.]+[^>]*>/ // React/JSX
  ];

  const hasKeywords = () => /\b(console\.log|process\.exit)\b/.test(trimmed);
  const structuralSymbols = () => (trimmed.match(/[{};=>]/g) || []).length > 2;

  return indicators.some(re => re.test(trimmed)) || (hasKeywords() && structuralSymbols());
};

/**
 * Is content Python-like?
 *
 * Matching:
 * - shebangs
 * - Function/classes
 * - Main block entry point
 * - Native imports
 *
 * @param content - Input value
 * @returns Returns `true` if the content is Python-like
 */
const isPythonLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }
  const trimmed = content.trim();

  const indicators = [
    /#!\s*.*\b(python|pypy)\b/, // shebangs
    /^\s*(def|class)\s+[a-zA-Z_]\w*\s*(\(.*?\))?\s*:/m, // Function/class definitions
    /^\s*if\s+__name__\s*==\s*['"]__main__['"]\s*:/m, // Main block entry point
    /^\s*(import\s+[a-zA-Z_]\w*|from\s+[a-zA-Z_]\w*\s+import)/m // Native imports
  ];

  const hasKeywords = () => /\b(sys\.exit|print)\b/.test(trimmed);
  const structuralSymbols = () => (trimmed.match(/[:=()]/g) || []).length > 2;

  return indicators.some(re => re.test(trimmed)) || (hasKeywords() && structuralSymbols());
};

/**
 * Is content Shell-like?
 *
 * Matching:
 * - shebangs
 * - Function/classes
 * - Main block entry point
 * - Native imports
 *
 * @param content - Input value
 * @returns Returns `true` if the content is Shell-like
 */
const isShellLike = (content: unknown): boolean => {
  if (typeof content !== 'string') {
    return false;
  }
  const trimmed = content.trim();

  const indicators = [
    /#!\s*.*\b(bash|sh|zsh)\b/, // shebangs
    /^\s*(unset\s+\w+|export\s+\w+=|local\s+\w+=)/m, // Env vars
    /^\s*(if\s+\[\[|case\s+.*?\s+in|for\s+\w+\s+in\s+)/m, // Shell control blocks
    /^\s*[a-zA-Z_]\w*\s*\(\s*\)\s*\{/m // Shell functions: name() {
  ];

  const hasKeywords = () => /\b(echo|printf)\b/.test(trimmed);
  const structuralSymbols = () => (trimmed.match(/[{}[\]$;|&><=]/g) || []).length > 2;

  return indicators.some(re => re.test(trimmed)) || (hasKeywords() && structuralSymbols());
};

/**
 * Is content script-like?
 *
 * Script matching:
 * - Shebangs
 * - Bash/Shell
 * - Python
 * - Java
 * - JS/TS/JSX/TSX
 * - Common statements across JS, TS, Java, and Python
 *
 * @param content - Input value
 * @returns Return `true` if content is script-like
 */
const isScriptLike = (content: unknown): boolean => {
  if (!content || typeof content !== 'string') {
    return false;
  }

  const trimmed = content.trim();

  if (!trimmed) {
    return false;
  }

  if (
    isXmlLike(trimmed) ||
    isCssLike(trimmed) ||
    isMarkdown(trimmed) ||
    isJson(trimmed) ||
    isJsonLike(trimmed)
  ) {
    return false;
  }

  return isJavaLike(trimmed) || isJsLike(trimmed) || isPythonLike(trimmed) || isShellLike(trimmed);
};

/**
 * Determine the "type" of content based on its structure and formatting.

 * Content type identifiers:
 * - See {@link isMarkdown}
 * - See {@link isJsonLike} and {@link isJson}
 * - See {@link isCssLike}
 * - See {@link isXmlLike}
 * - See {@link isPythonLike}
 * - See {@link isShellLike}
 * - See {@link isJavaLike}
 * - See {@link isJsLike}
 *
 * @param content - Input value.
 * @returns A type of content string, or empty if the content type can't be determined.
 */
const contentType = (content: unknown): '' | 'sh' | 'python' | 'markdown' | 'java' | 'javascript' | 'json' | 'html' | 'css' => {
  const updatedLanguage = '';

  if (content === null || content === undefined || (typeof content === 'string' && content.trim().length <= 0)) {
    return '';
  }

  if (isMarkdown(content as string)) {
    return 'markdown';
  }

  if (isJson(content)) {
    return 'json';
  }

  if (isXmlLike(content)) {
    return 'html';
  }

  if (isJsLike(content)) {
    return 'javascript';
  }

  if (isShellLike(content)) {
    return 'sh';
  }

  if (isPythonLike(content)) {
    return 'python';
  }

  if (isJavaLike(content)) {
    return 'java';
  }

  if (isCssLike(content)) {
    return 'css';
  }

  if (isJsonLike(content)) {
    return 'json';
  }

  return updatedLanguage;
};

/**
 * Format content as a code block for Markdown rendering.
 *
 * @note We purposefully allow passing in `null`, `undefined`, and empty strings since
 * that may be the content the consumer is attempting to render.
 *
 * @param content - Content to format.
 * @param options - Config options for formatting.
 * @param [options.langOverride] - Override the detected language for highlighting.
 * @param [options.allowWrappingMarkdown=false] - Determine if already-marked Markdown content should be forcefully wrapped.
 * @returns A formatted content string wrapped in a Markdown code block, or the original content.
 */
const formatContentForMarkdown = (
  content: unknown,
  { langOverride, allowWrappingMarkdown = false }: { langOverride?: string; allowWrappingMarkdown?: boolean } = {}
) => {
  const updatedLanguage = langOverride || contentType(content);
  let updatedContent = content;

  if (!allowWrappingMarkdown && isMarkdown(updatedContent) && (!langOverride || updatedLanguage === 'markdown')) {
    return updatedContent;
  }

  if (updatedLanguage === 'json') {
    try {
      const parsed = typeof updatedContent === 'string' ? JSON.parse(updatedContent.trim()) : updatedContent;

      updatedContent = JSON.stringify(parsed, null, 2);
    } catch {}
  }

  return `\`\`\`${updatedLanguage}\n${updatedContent}\n\`\`\``;
};

/**
 * Centralized completion logic for PatternFly resources.
 *
 * @param {FilterPatternFlyFilters} filters
 */
const paramCompletion = async (filters: FilterPatternFlyFilters) => {
  const normalizedVersion = await normalizeEnumeratedPatternFlyVersion.memo(filters.version);
  const { byEntry } = await filterPatternFly.memo({ ...filters, version: normalizedVersion || filters.version });

  const names = new Set<string>();
  const categories = new Set<string>();
  const sections = new Set<string>();
  const versions = new Set<string>();
  const schemas = new Set<string>();

  for (const entry of byEntry) {
    if (typeof entry.name === 'string') {
      names.add(entry.name);
    }

    if (typeof entry.category === 'string') {
      categories.add(entry.category);
    }

    if (typeof entry.section === 'string') {
      sections.add(entry.section);
    }

    if (typeof entry.version === 'string') {
      versions.add(entry.version);
    }

    if (entry.uriSchemas !== undefined && typeof entry.name === 'string') {
      schemas.add(entry.name);
    }
  }

  return {
    names: Array.from(names).sort(),
    categories: Array.from(categories).sort(),
    schemas: Array.from(schemas).sort(),
    sections: Array.from(sections).sort(),
    versions: Array.from(versions).sort()
  };
};

export {
  contentType,
  formatContentForMarkdown,
  isJavaLike,
  isJsLike,
  isJson,
  isJsonLike,
  isCssLike,
  isMarkdown,
  isPythonLike,
  isScriptLike,
  isShellLike,
  isXmlLike,
  paramCompletion
};
