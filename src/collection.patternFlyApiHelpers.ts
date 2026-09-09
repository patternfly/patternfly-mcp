import {
  breakdownProse,
  contentType,
  getInlinedCodeBlockCount,
  isJson,
  isJsonLike
} from './resource.helpers';

/**
 * Detect imports that use the `?raw` query param.
 *
 * @param str
 */
const isRawImport = (str: string) =>
  /import\s+[\w*\s{},]+\s+from\s+['"][^'"]+\?raw['"]/i.test(str);

/**
 * Count the number of raw imports in a given string.
 *
 * @param str - Input string.
 * @returns Number of raw imports found in the input string.
 */
const getRawImportCount = (str: string): number =>
  (str.match(/import\s+[\w*\s{},]+\s+from\s+['"][^'"]+\?raw['"]/gi) || []).length;

/**
 * Count the number of `<LiveExample>` tags in a given string.
 *
 * @param str - Input string to search for `<LiveExample>` tags.
 * @returns `<LiveExample>` count found in the input string.
 */
const getLiveExampleCount = (str: string) =>
  (str.match(/<LiveExample\b[^>]*\/?>/gi) || []).length;

/**
 * Detect empty code fences with external file references that weren't
 * inlined. (e.g., ```ts file = "./ButtonBasic.tsx" \n```)
 *
 * Considered empty if:
 * - A fenced code block with a `file` attribute is specified but no content.
 * - A fenced code block with no content inside the block, regardless of attributes or language.
 *
 * @param str - Input string.
 * @returns Returns `true` if the input string contains an empty code fence.
 */
const hasEmptyFileCodeFence = (str: string) =>
  /```[\w-]*\s+file="[^"]+"\s*\n\s*```/i.test(str) ||
  /```[\w-]*\s*\n\s*```/.test(str);

/**
 * Calculate template example counts.
 *
 * - When `?raw` import and `<LiveExample>` are paired (1:1), count as 1 unit.
 * - When `?raw` import and `<LiveExample>` appear without the other (orphaned/unpaired), each adds 1 independently to the count.
 *
 * @param content - Input content.
 * @returns Total effective template reference count.
 */
const getTemplateCount = (content: string): { pairedCount: number; orphanCount: number; totalUnits: number } => {
  const liveCount = getLiveExampleCount(content);
  const rawCount = getRawImportCount(content);

  const pairedCount = Math.min(liveCount, rawCount);
  const orphanCount = Math.abs(liveCount - rawCount);
  const totalUnits = pairedCount + orphanCount; // Equivalent to Math.max(liveCount, rawCount)

  return { pairedCount, orphanCount, totalUnits };
};

/**
 * Is the content a content aggregator?
 *
 * @param content - Content to eval.
 * @returns Returns `true` if the content aggregates other content.
 */
const isContentAggregator = (content: string): boolean => {
  const type = contentType(content);

  if (type !== '' && type !== 'markdown' && type !== 'html') {
    return false;
  }

  const { totalUnits } = getTemplateCount(content);
  const inlinedCodeCount = getInlinedCodeBlockCount(content);

  // Check: Multiple external example tags without inlined blocks
  if (totalUnits >= 2 && inlinedCodeCount === 0) {
    return true;
  }

  // Check: High template density
  if (totalUnits > inlinedCodeCount * 2 && totalUnits >= 3) {
    return true;
  }

  // Check: Template tags present without paragraphs
  const { paragraphs } = breakdownProse(content);

  return totalUnits >= 1 && paragraphs < 2 && inlinedCodeCount === 0;
};

/**
 * Determine if the content has anything to offer, weight.
 *
 * Counts:
 * - if the content type must be empty or 'markdown'
 * - if the content contains at least 2 paragraphs, or has a word count of at
 *     least 100, or has at least one inline code block
 * - if the live example, template count, is greater than zero
 *
 * @param content - Content to eval
 * @returns `true` has weight.
 */
const isSubstantialGuide = (content: string) => {
  const { totalUnits } = getTemplateCount(content);
  const inlinedCount = getInlinedCodeBlockCount(content);
  const { type, paragraphs, wordCount } = breakdownProse(content);
  const hasSubstance = paragraphs >= 2 || wordCount >= 100 || inlinedCount >= 1;

  return (type === '' || type === 'markdown') && hasSubstance && totalUnits > 0;
};

/**
 * Calculate a quality score for a PatternFly API response.
 *
 * @param content - Content to score.
 * @param [options] - Function options
 * @param [options.baseScore] - Base starting score.
 * @param [options.category] - Used to determine which quality metrics are applied.
 * @param [options.qualityReduction] - Amount to reduce the base score for each quality metric.
 * @param [options.minCharacters] - Minimum number of characters required to avoid quality reduction.
 * @returns The calculated quality score.
 */
const calculateContentQualityScore = (
  content: unknown,
  {
    baseScore = 1, category, qualityReduction = 0.03, minCharacters = 100
  }: { baseScore?: number; category?: undefined | string; qualityReduction?: number; minCharacters?: number } = {}
): number => {
  if (content === undefined || content === null) {
    return baseScore;
  }

  const raw = typeof content === 'number' ? String(content) : content;

  if (typeof raw !== 'string') {
    return baseScore;
  }

  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return baseScore;
  }

  if (category === 'examples') {
    return baseScore;
  }

  let score = baseScore;

  if (isJsonLike(trimmed) && !isJson(trimmed)) {
    score -= qualityReduction;
  }

  const { totalUnits } = getTemplateCount(trimmed);

  if (isContentAggregator(trimmed)) {
    // Aggregator overview pages take linear deductions, falling below 0.95
    score -= qualityReduction * Math.max(2, totalUnits);
  } else if (isSubstantialGuide(trimmed)) {
    // Developer guides, cap isolated demo tag/raw imports
    score -= qualityReduction;
  } else {
    // Non-guide stubs
    score -= qualityReduction * totalUnits;
  }

  if (trimmed.length < minCharacters && !trimmed.includes('```') && !hasEmptyFileCodeFence(trimmed)) {
    score -= qualityReduction;
  }

  if (hasEmptyFileCodeFence(trimmed)) {
    score -= qualityReduction;

    if (trimmed.length < minCharacters) {
      score -= qualityReduction;
    }
  }

  return Number(Math.min(1, Math.max(0, score)).toFixed(3));
};

/**
 * Transform a string.
 *
 * @param segment - Input string to normalize.
 * @returns Normalized slug.
 */
const normalizeSlug = (segment: string): string => {
  let updatedSegment = segment;

  if (/[A-Z]/.test(updatedSegment) && !/^(ai|css|html|mcp|cli|uxd|ui|api|faq|faqs|aria|rtl)$/i.test(updatedSegment)) {
    const split = updatedSegment.split(/(?=[A-Z])/);

    if (split.every(val => /^[A-Z]/.test(val))) {
      updatedSegment = split.join('-');
    }
  }

  return updatedSegment
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/-+/g, '-');
};

/**
 * Format a compound slug into a clean title.
 * E.g., 'ai-assisted-development_ai-assisted-code-migration' -> 'AI Assisted Development: AI Assisted Code Migration'
 *
 * @param slug
 * @param section
 */
const formatSlugToTitle = (slug: string, section?: string): string => {
  if (!slug) {
    return 'PatternFly API';
  }

  const acronyms = ['ai', 'css', 'html', 'mcp', 'cli', 'uxd', 'ui', 'api', 'faq', 'faqs', 'aria', 'rtl'];
  const acronymRegex = new RegExp(`^(${acronyms.join('|')})$`, 'i');

  const cleanSection = section
    ? section
      .split('-')
      .map(wordPhrase =>
        (acronymRegex.test(wordPhrase)
          ? wordPhrase.toUpperCase()
          : wordPhrase.charAt(0).toUpperCase() + wordPhrase.slice(1))).join(' ')
    : '';

  // Handle bare generic names like 'overview'
  if (slug.toLowerCase() === 'overview' && cleanSection) {
    return `${cleanSection} Overview`;
  }

  return slug
    .split('_')
    .map(segment =>
      segment
        .split('-')
        .map(word => {
          if (acronymRegex.test(word)) {
            return word.toUpperCase();
          }

          return word.charAt(0).toUpperCase() + word.slice(1);
        })
        .join(' '))
    .join(': ');
};

/**
 * Generate a display name from metadata.
 *
 * @param [content] - Optional content string.
 * @param [context] - Optional context object for generating a unique name.
 * @param [context.slug] - Optional slug used for fallback or secondary formatting of the display name.
 * @param [context.category] - Optional category of content being processed (e.g., 'props', 'css', or 'doc').
 * @param [context.section] - Optional section name used for refining the display name.
 * @returns Extracted or formatted display name for the API item.
 */
const extractApiDisplayName = (content?: string, context: { slug?: string; category?: string; section?: string; } = {}): string => {
  const { slug = '', category = 'doc', section } = context || {};

  const trimmed = content?.trim() || '';

  // Props JSON signature
  if (category === 'props' && trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);

      if (parsed.name) {
        return parsed.name;
      }
    } catch {}
  }

  // CSS JSON Array signature
  if (category === 'css') {
    return slug.toLowerCase().includes('css') ? formatSlugToTitle(slug, section) : `${formatSlugToTitle(slug, section)} CSS`;
  }

  // Markdown H1 signature (# Title)
  const h1Match = trimmed.match(/^#\s+([^\r\n]+)/m);

  if (h1Match?.[1]?.trim()) {
    const title = h1Match[1].trim();

    // If the H1 is just "Overview", qualify it with the section
    if (title.toLowerCase() === 'overview' && section) {
      return formatSlugToTitle('overview', section);
    }

    return title;
  }

  // Fallback to slug
  return formatSlugToTitle(slug, section);
};

/**
 * Provide a fallback description based on kind/category when no prose is available.
 *
 * @param displayName - Display name
 * @param [category] - Category / facet kind
 */
const getApiFallbackDescription = (displayName: string, category?: string): string => {
  const trimmed = typeof displayName === 'string' ? displayName.trim() : '';
  const updatedDisplayName = trimmed ? ` for ${trimmed}` : '';

  switch (category) {
    case 'props':
      return `PatternFly React component props and TypeScript interfaces${updatedDisplayName}.`;
    case 'css':
      return `PatternFly ${
        displayName.toLowerCase().includes('css') ? '' : 'CSS '}variables and tokens${updatedDisplayName}.`;
    case 'html':
    case 'html-demos':
      return `PatternFly HTML examples and markup structure${updatedDisplayName}.`;
    case 'react':
    case 'react-demos':
      return `PatternFly React component examples and demos${updatedDisplayName}.`;
    case 'examples':
      return `PatternFly examples and demos${updatedDisplayName}.`;
    default:
      return `PatternFly documentation and guidelines${updatedDisplayName}.`;
  }
};

/**
 * Generate a description from metadata.
 *
 * @note CodeQL false positive: Prose cleanup for plain-text LLM descriptions,
 * not DOM XSS sanitization.
 *
 * @note This is NOT an HTML sanitizer for browser DOM rendering and is bound
 * to trigger false positives in code evaluations. This produces concise plain-text
 * descriptions.
 *
 * @param [content] - Optional content.
 * @param [context] - Optional context for generating a unique description.
 * @param [context.displayName] - Display name.
 * @param [context.category] - Type of content.
 * @param [context.detailType] - Alternate to `category, like "examples".
 * @returns A generated description from metadata, or a fallback.
 */
const extractApiDescription = (
  content?: string,
  context: { displayName?: string; category?: string; detailType?: string | undefined } = {}
): string => {
  const { displayName = '', category = 'doc', detailType = '' } = context || {};

  if (category === 'props' || category === 'css') {
    return getApiFallbackDescription(displayName, category);
  }

  if (detailType === 'examples') {
    return getApiFallbackDescription(displayName, detailType);
  }

  if (content) {
    // Replace import statements, multiline code blocks
    const cleanContent = content
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/gm, '')
      .replace(/import\s+['"][^'"]+['"];?/gm, '')
      .replace(/```[\s\S]*?```/gm, '');

    // Filter headings, tags, and common HTML attributes
    const lines = cleanContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => {
        const updatedLine = line.toLowerCase();

        return updatedLine &&
          !updatedLine.startsWith('import ') &&
          !updatedLine.startsWith('#') &&
          !updatedLine.startsWith('---') &&
          !updatedLine.startsWith('![') &&
          !updatedLine.startsWith('<') &&
          !updatedLine.startsWith('```') &&
          !updatedLine.startsWith('export ') &&
          !updatedLine.startsWith('|') &&
          !updatedLine.startsWith('class=') &&
          !updatedLine.startsWith('className=') &&
          !updatedLine.startsWith('style=') &&
          !updatedLine.startsWith('d="') &&
          !updatedLine.startsWith('viewBox=') &&
          !/^[A-Za-z]+="(.*)"/.test(updatedLine) &&
          !/^(ts|tsx|js|jsx|html)\s+/i.test(updatedLine) &&
          !updatedLine.includes('require(') &&
          !updatedLine.includes('file="./') &&
          !updatedLine.startsWith('["') &&
          !updatedLine.endsWith(',') &&
          !/^[A-Za-z0-9]+\./.test(updatedLine) &&
          !/^[A-Z][A-Za-z0-9]+,$/.test(updatedLine) &&
          !updatedLine.includes('<script') &&
          !updatedLine.includes('&lt;script') &&
          updatedLine.length > 20;
      });

    // Finally, does the copy exist?
    if (lines.length > 0 && lines[0]) {
      let cleanPara = lines[0]
        // Convert HTML links to their inner text
        .replace(/<a\b[^>]*>(.*?)<\/a>/gi, '$1')
        // Remove closing HTML tags
        .replace(/<\/[a-z0-9_-]+>/gi, '')
        // Convert bare tags
        .replace(/<([a-z0-9_\s-]+)>/gi, '`$1`')
        // Remove remaining complex HTML tags with attributes
        .replace(/<[a-z0-9_-]+\b[^>]*\/?>/gi, '')
        // Replace Markdown inline images: `![alt](url) -> alt`
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        // Replace Markdown links: `[text](url) -> text`
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Replace Markdown reference links: `[text][ref] -> text`
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
        // Remove Markdown formatting characters (bold, italics, inline code, strikethrough)
        .replace(/[*_`~]/g, '')
        // Normalize excess whitespace
        .replace(/\s+/g, ' ')
        .trim();

      if (cleanPara.endsWith(':')) {
        cleanPara = `${cleanPara.slice(0, -1)}.`;
      }

      return cleanPara.length > 200 ? `${cleanPara.slice(0, 197)}...` : cleanPara;
    }
  }

  // Fallback
  return getApiFallbackDescription(displayName, category);
};

/**
 * Extracts and constructs an API entry name based on the provided item and section.
 *
 * @param item - Entry base name.
 * @param section - Entry section.
 * @returns Extracted entry name
 */
const extractApiName = (item: string, section: string): string => {
  const normalizedItem = item.trim().toLowerCase();
  const normalizedSection = section.trim().toLowerCase();

  if (normalizedSection === 'components') {
    return normalizedItem;
  }

  if (normalizedItem === 'overview') {
    return `${normalizedSection}-overview`;
  }

  // Prevent double-prefix
  if (normalizedItem.startsWith(`${normalizedSection}-`)) {
    return normalizedItem;
  }

  return `${normalizedSection}-${normalizedItem}`;
};

export {
  calculateContentQualityScore,
  extractApiDescription,
  extractApiDisplayName,
  extractApiName,
  formatSlugToTitle,
  isContentAggregator,
  isSubstantialGuide,
  getApiFallbackDescription,
  getLiveExampleCount,
  getRawImportCount,
  getTemplateCount,
  hasEmptyFileCodeFence,
  isRawImport,
  normalizeSlug
};
