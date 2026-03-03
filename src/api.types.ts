/**
 * Matches the output shape of patternfly-doc-core's /api/component-index.json endpoint.
 */
interface ComponentEntry {
  section: string;
  page: string;
  tabs: string[];
  hasProps: boolean;
  hasCss: boolean;
  exampleCount: number;
}

/**
 * Matches the output shape of patternfly-doc-core's /api/component-index.json endpoint.
 */
interface ComponentIndex {
  version: string;
  components: Record<string, ComponentEntry>;
}

type ResolvedComponentInfo = ComponentEntry & { name: string };

type DocIncludeType = 'docs' | 'props' | 'examples' | 'css';

export {
  type ComponentEntry,
  type ComponentIndex,
  type ResolvedComponentInfo,
  type DocIncludeType
};
