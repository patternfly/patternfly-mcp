/**
 * PatternFly JSON catalog doc
 */
type PatternFlyMcpDocsCatalogDoc = {
  displayName: string;
  description: string;
  pathSlug: string;
  section: string;
  category: string;
  source: string;
  path: string;
  version: string;
};

/**
 * PatternFly JSON catalog documentation entries.
 */
type PatternFlyMcpDocsCatalogEntry = {
  [key: string]: PatternFlyMcpDocsCatalogDoc[]
};

/**
 * PatternFly documentation catalog.
 *
 * @interface PatternFlyMcpDocsCatalog
 *
 * @property [version] - Version of the catalog.
 * @property [generated] - Date when the catalog was generated.
 * @property {PatternFlyMcpDocsCatalogEntry} docs - PatternFly documentation entries.
 */
interface PatternFlyMcpDocsCatalog {
  version?: string;
  generated?: string;
  meta: {
    totalEntries: number;
    totalDocs: number;
    source: string;
  };
  docs: PatternFlyMcpDocsCatalogEntry
}

/**
 * Fallback documentation for when the catalog is unavailable.
 * Points to the high-level entry points for PatternFly.
 */
const EMBEDDED_DOCS: PatternFlyMcpDocsCatalog = {
  meta: {
    totalEntries: 2,
    totalDocs: 5,
    source: 'patternfly-mcp-fallback'
  },
  docs: {
    patternfly: [
      {
        displayName: 'PatternFly Home',
        description: 'Official PatternFly design system website.',
        pathSlug: 'patternfly-home',
        section: 'home',
        category: 'reference',
        source: 'website',
        path: 'https://www.patternfly.org',
        version: 'v6'
      },
      {
        displayName: 'PatternFly GitHub',
        description: 'PatternFly organization on GitHub (Core & React).',
        pathSlug: 'patternfly-github',
        section: 'github',
        category: 'reference',
        source: 'github',
        path: 'https://github.com/patternfly',
        version: 'v6'
      },
      {
        displayName: 'PatternFly Org',
        description: 'Direct source for PatternFly documentation and guidelines.',
        pathSlug: 'patternfly-org',
        section: 'github',
        category: 'reference',
        source: 'github',
        path: 'https://github.com/patternfly/patternfly-org',
        version: 'v6'
      }
    ],
    React: [
      {
        displayName: 'PatternFly React Docs',
        description: 'Direct source for PatternFly React component examples.',
        pathSlug: 'patternfly-react',
        section: 'components',
        category: 'react',
        source: 'github',
        path: 'https://raw.githubusercontent.com/patternfly/patternfly-react/refs/heads/main/README.md',
        version: 'v6'
      },
      {
        displayName: 'React Development Rules',
        description: 'AI guidance for PatternFly React development rules.',
        pathSlug: 'react-development',
        section: 'guidelines',
        category: 'react',
        source: 'github',
        path: 'https://raw.githubusercontent.com/patternfly/ai-helpers/refs/heads/main/docs/README.md',
        version: 'v6'
      }
    ]
  }
};

export {
  EMBEDDED_DOCS,
  type PatternFlyMcpDocsCatalog,
  type PatternFlyMcpDocsCatalogEntry,
  type PatternFlyMcpDocsCatalogDoc
};
