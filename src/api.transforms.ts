interface PropEntry {
  name: string;
  type?: string;
  defaultValue?: string | number | boolean;
  required?: boolean;
  description?: string;
}

interface ComponentPropsData {
  description?: string;
  props?: PropEntry[];
}

interface CssToken {
  name?: string;
  var?: string;
  value?: string;
}

/**
 * Transform raw markdown from the doc-core API into a token-efficient format.
 *
 * @param raw
 * @param componentName
 * @note The doc-core `/text` endpoint returns raw MDX which includes `<LiveExample>` tags,
 * import statements, and HTML comments. These are noise for LLM consumption and are stripped.
 * The `<LiveExample>` tags are replaced with `[Example: name]` references so the LLM knows
 * examples exist without the heavy JSX.
 */
const transformDocs = (raw: string, componentName: string): string => {
  let result = raw;

  result = result.replace(/^import\s+.*$/gm, '');

  result = result.replace(
    /<LiveExample\s+[^>]*?(?:src=\{?["']?([^"'}\s>]+)["']?\}?)?[^>]*?\/?>/gi,
    (_match, src) => {
      const exampleName = src
        ? src.replace(/.*\//, '').replace(/\.[^.]+$/, '')
        : componentName;

      return `[Example: ${exampleName}]`;
    }
  );

  result = result.replace(/<!--[\s\S]*?-->/g, '');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
};

/**
 * Transform raw props JSON into a compact markdown table.
 *
 * @param raw
 * @param componentName
 * @note The doc-core `/props` endpoint returns a keyed object where each key is a component
 * name (e.g., "AlertProps", "Alert") and the value contains a `props` array. A single page
 * can return multiple components (e.g., Alert page returns Alert, AlertGroup, AlertIcon).
 *
 * @example Input shape:
 * ```json
 * {
 *   "Alert": {
 *     "description": "...",
 *     "props": [{ "name": "variant", "type": "'success' | 'danger'", "required": false }]
 *   }
 * }
 * ```
 */
const transformProps = (raw: string, componentName: string): string => {
  const data = JSON.parse(raw);
  const sections: string[] = [];

  const entries = typeof data === 'object' && data !== null
    ? Object.entries(data) as [string, ComponentPropsData][]
    : [];

  for (const [name, component] of entries) {
    const props: PropEntry[] = component?.props || [];

    if (props.length === 0) {
      continue;
    }

    const lines: string[] = [];

    lines.push(`## ${name} Props`);

    if (component?.description) {
      lines.push('');
      lines.push(component.description);
    }

    lines.push('');
    lines.push('| Prop | Type | Default | Required | Description |');
    lines.push('|------|------|---------|----------|-------------|');

    for (const prop of props) {
      const type = escapeTableCell(prop.type || '-');
      const defaultVal = prop.defaultValue != null ? escapeTableCell(String(prop.defaultValue)) : '-';
      const required = prop.required ? '**yes**' : 'no';
      const description = escapeTableCell(prop.description || '-');

      lines.push(`| ${prop.name} | ${type} | ${defaultVal} | ${required} | ${description} |`);
    }

    sections.push(lines.join('\n'));
  }

  if (sections.length === 0) {
    return `## ${componentName} Props\n\nNo props data available.`;
  }

  return sections.join('\n\n');
};

/**
 * Transform raw CSS variables JSON into a compact markdown table.
 *
 * @param raw
 * @param componentName
 * @note The doc-core `/css` endpoint returns an array of token objects. The field name
 * varies between `name` and `var` depending on the token type, so both are checked.
 */
const transformCss = (raw: string, componentName: string): string => {
  const tokens: CssToken[] = JSON.parse(raw);

  if (!Array.isArray(tokens) || tokens.length === 0) {
    return `## ${componentName} CSS Variables\n\nNo CSS variables available.`;
  }

  const lines: string[] = [];

  lines.push(`## ${componentName} CSS Variables`);
  lines.push('');
  lines.push('| Variable | Value |');
  lines.push('|----------|-------|');

  for (const token of tokens) {
    const name = token.name || token.var || '-';
    const value = escapeTableCell(token.value || '-');

    lines.push(`| ${name} | ${value} |`);
  }

  return lines.join('\n');
};

const escapeTableCell = (value: string): string =>
  value.replace(/\|/g, '\\|').replace(/\n/g, ' ');

export {
  transformDocs,
  transformProps,
  transformCss,
  escapeTableCell
};
