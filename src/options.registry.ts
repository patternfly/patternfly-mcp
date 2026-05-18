import { type McpToolCreator, type McpResourceCreator } from './mcpSdk';
import { usePatternFlyDocsTool } from './tool.patternFlyDocs';
import { searchPatternFlyDocsTool } from './tool.searchPatternFlyDocs';
import { patternFlyComponentsIndexResource } from './resource.patternFlyComponentsIndex';
import { patternFlyContextResource } from './resource.patternFlyContext';
import { patternFlyDocsIndexResource } from './resource.patternFlyDocsIndex';
import { patternFlyDocsTemplateResource } from './resource.patternFlyDocsTemplate';
import { patternFlySchemasIndexResource } from './resource.patternFlySchemasIndex';
import { patternFlySchemasTemplateResource } from './resource.patternFlySchemasTemplate';

/**
 * Built-in tools.
 *
 * Array of built-in tools
 */
const builtinTools: McpToolCreator[] = [
  usePatternFlyDocsTool,
  searchPatternFlyDocsTool
];

/**
 * Built-in resources.
 *
 * Array of built-in resources
 */
const builtinResources: McpResourceCreator[] = [
  patternFlyContextResource,
  patternFlyComponentsIndexResource,
  patternFlyDocsIndexResource,
  patternFlyDocsTemplateResource,
  patternFlySchemasIndexResource,
  patternFlySchemasTemplateResource
];

export { builtinTools, builtinResources };
