import {
  McpClient,
  createMcpChannel,
  type McpClientCallToolResult,
  type McpClientCallResourceResultContent,
  type McpChannel,
  type McpServer
} from './mcpSdk';
import { timeoutFunction } from './server.helpers';
import { memo } from './server.caching';
import { getOptions, getSessionOptions } from './options.context';
import { type GlobalOptions } from './options';
import { runInteractiveClient } from './client.screens';
import { getServerCollectionsRegistry } from './collections';
import { log } from './logger';

/**
 * A linkable resource item.
 *
 * @interface ResourceLinkItem
 *
 * @property uri - Resource URI.
 * @property name - Resource name.
 * @property description - Optional resource description.
 * @property groupId - Optional group ID for resource association.
 * @property recordId - Optional record ID for resource association.
 * @property primaryCollection - Optional primary collection ID for resource association.
 */
interface ResourceLinkItem {
  uri: string;
  name: string;
  description?: string | undefined;
  groupId?: string | undefined;
  recordId?: string | undefined;
  primaryCollection?: string | undefined;
}

/**
 * Client resource read result.
 *
 * @interface ClientResourceReadResult
 *
 * @property text - Resource text content.
 * @property truncated - Whether the resource text was truncated.
 */
interface ClientResourceReadResult {
  text: string;
  truncated: boolean;
}

/**
 * Async MCP client instance.
 *
 * @interface ClientInstance
 *
 * @property search - Search available resources.
 * @property readResource - Read resource contents by URI.
 * @property listCollections - Retrieve available collection names registered on the server.
 * @property close - Close the client connection.
 * @property isConnected - Check if the client is connected.
 */
interface ClientInstance {
  search: (query: string, collection?: string) => Promise<ResourceLinkItem[]>;
  readResource: (uri: string) => Promise<ClientResourceReadResult>;
  listCollections: () => string[];
  close: () => Promise<void>;
  isConnected: () => boolean;
}

/**
 * Client options. Equivalent to GlobalOptions.
 */
type ClientOptions = GlobalOptions;

/**
 * Client settings matching server lifecycle options.
 *
 * @interface ClientSettings
 *
 * @property [allowProcessExit] - Determines if the process is allowed to exit explicitly.
 * @property [server] - Active McpServer instance to link to via in-process channel.
 */
interface ClientSettings {
  allowProcessExit?: boolean | undefined;
  server?: McpServer | undefined;
}

/**
 * Determine whether a tool result content item is a "resource link".
 *
 * @param item - Tool result content item to inspect.
 * @returns `true` if the item is a resource link content object; otherwise, `false`.
 */
const isResourceLinkContent = (
  item: unknown
): item is { type: 'resource_link'; uri: string; name: string; description?: string } => {
  if (!item || typeof item !== 'object') {
    return false;
  }

  const candidate = item as Record<string, unknown>;

  return (
    candidate.type === 'resource_link' &&
    typeof candidate.uri === 'string' &&
    typeof candidate.name === 'string'
  );
};

/**
 * Parse resource links from a call tool result.
 *
 * @param result - Tool execution result containing candidate resource links.
 * @returns Extracted list of resource link items.
 */
const parseResourceLinks = (result: McpClientCallToolResult): ResourceLinkItem[] => {
  if (!result.content?.length) {
    return [];
  }

  return result.content.filter(isResourceLinkContent).map(item => {
    // const meta = (item as { _meta?: Record<string, unknown> })._meta;
    const itemRecord = item as {
      groupId?: string;
      recordId?: string;
      primaryCollection?: unknown;
      _meta?: Record<string, unknown>;
    };

    const meta = itemRecord._meta;

    const groupId =
      (typeof meta?.groupId === 'string' && meta.groupId) ||
      (typeof meta?.['patternfly.org/groupId'] === 'string' && meta['patternfly.org/groupId']) ||
      (typeof itemRecord.groupId === 'string' && itemRecord.groupId) ||
      undefined;

    const recordId =
      (typeof meta?.recordId === 'string' && meta.recordId) ||
      (typeof itemRecord.recordId === 'string' && itemRecord.recordId) ||
      undefined;

    const primaryCollection =
      (typeof meta?.primaryCollection === 'string' && meta.primaryCollection) ||
      (typeof meta?.['patternfly.org/primaryCollection'] === 'string' && meta['patternfly.org/primaryCollection']) ||
      (typeof itemRecord.primaryCollection === 'string' && itemRecord.primaryCollection) ||
      undefined;

    return {
      uri: item.uri,
      name: item.name,
      ...(groupId ? { groupId } : {}),
      ...(recordId ? { recordId } : {}),
      ...(primaryCollection ? { primaryCollection } : {}),
      ...(item.description !== undefined ? { description: item.description } : {})
    };
  });
};

/**
 * Convert MCP client resource-read contents into plain text.
 *
 * @param contents - Array of text or binary blob content returned by MCP resource read.
 * @returns Materialized text representation of the resource.
 */
const renderClientResourceText = (contents: McpClientCallResourceResultContent): string => {
  const parts: string[] = [];

  for (const content of contents) {
    if ('text' in content && typeof content.text === 'string') {
      parts.push(content.text);
      continue;
    }

    if ('blob' in content && typeof content.blob === 'string') {
      try {
        parts.push(Buffer.from(content.blob, 'base64').toString('utf8'));
      } catch {
        parts.push('[Binary resource blob — use `pf-client read <uri>` in a shell to redirect output to a file.]');
      }
    }
  }

  const joined = parts.join('\n\n---\n\n').trim();

  if (joined.length) {
    return joined;
  }

  return '(No readable text returned for this URI. Prefer a specific doc entry instead of a collection link.)';
};

/**
 * MCP client for agentless search and resource reads.
 *
 * @param [options] - Client options.
 * @param [settings] - Client lifecycle settings and connection channel.
 * @param [settings.allowProcessExit] - Determines if the process is allowed to exit explicitly.
 * @param [settings.server] - Active McpServer instance to bridge the in-process channel.
 * @returns Client instance with search, read, and interactive UI methods.
 */
const runClient = async (
  options: ClientOptions = getOptions(),
  settings: ClientSettings = {}
): Promise<ClientInstance> => {
  const _session = getSessionOptions();
  let connected = false;
  let channel: McpChannel | null = null;

  const client = new McpClient(
    {
      name: options.name || getOptions().name,
      version: options.version || getOptions().version
    },
    { capabilities: {} }
  );

  /**
   * Search for resources using the provided query and optional collection.
   *
   * @param query - Search query.
   * @param collection - Optional collection to search within.
   * @returns A promise that resolves with an array of ResourceLinkItem objects.
   */
  const search = async (query: string, collection?: string): Promise<ResourceLinkItem[]> => {
    const args: Record<string, string> = { query };

    if (collection) {
      args.collection = collection;
    }

    const result = (await client.callTool({
      name: 'searchPatternFly',
      arguments: args
    })) as McpClientCallToolResult;

    return parseResourceLinks(result);
  };

  /**
   * Read a resource using the provided URI.
   *
   * @param uri - Resource URI.
   * @returns A promise that resolves with a ClientResourceReadResult object.
   */
  const readResource = async (uri: string): Promise<ClientResourceReadResult> => {
    try {
      const result = await client.readResource({ uri });
      const text = renderClientResourceText(result.contents ?? []);

      return { text, truncated: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      return {
        text: `# Unable to read resource\n\n\`${uri}\`\n\n${message}\n\nIf this was a **Collection** link, open a specific doc row from search instead.`,
        truncated: false
      };
    }
  };

  /**
   * Retrieve available collection names currently registered on the server.
   *
   * @returns Array of registered collection names.
   */
  const listCollections = (): string[] => {
    const registry = getServerCollectionsRegistry();

    if (registry instanceof Map && registry.size > 0) {
      return Array.from(registry.keys()).filter(Boolean);
    }

    return [];
  };

  /**
   * Close the client connection and resources.
   */
  const close = async (): Promise<void> => {
    connected = false;
    await client.close();
    await channel?.close();
    channel = null;
  };

  /**
   * Check if the client is connected.
   */
  const isConnected = (): boolean => connected;

  /**
   * Establish the client connection to an available MCP server channel.
   *
   * @returns A promise that resolves when the client has been connected.
   * @throws If no connected channel or active MCP server instance is available.
   * @throws If the in-process server channel connection times out.
   */
  const connectClient = async (): Promise<void> => {
    if (connected) {
      return;
    }

    if (settings.server) {
      channel = createMcpChannel();

      await timeoutFunction(
        settings.server.connect(channel.serverChannel),
        { errorMessage: 'MCP in-process channel connection timed out.' }
      );

      await client.connect(channel.clientChannel);
      connected = true;

      return;
    }

    throw new Error('A connected channel or active McpServer instance must be provided to connect runClient.');
  };

  /**
   * Wrap start and run for the interactive client session.
   *
   * @note Separated to help isolate functionality. In the future this could be
   * exported as part of the instance, altered or combined with connectClient for
   * convenience or a shift in architecture.
   *
   * @param client - Client instance to connect, run, and close.
   * @returns Promise that resolves when the client session has finished or is closed.
   * @throws Propagates any error thrown while connecting, running the interactive session, or closing the client.
   */
  const startClient = async (client: ClientInstance): Promise<void> => {
    try {
      await runInteractiveClient(client);
    } catch (error) {
      log.error(`Error running interactive client:`, error);
    } finally {
      await client.close();
    }
  };

  const instance: ClientInstance = {
    search,
    readResource,
    listCollections,
    close,
    isConnected
  };

  log.info('Interactive client starting');

  /**
   * Provide sync behavior and allow immediate connection.
   */
  await connectClient();

  /**
   * Start and run the interactive client session.
   *
   * @note Avoid/limit firing log events right after `startClient` they can
   * interfere in the terminal display.
   */
  void startClient(instance);

  return instance;
};

/**
 * Memoized version of runClient.
 * - Prevents multiple duplicate MCP server child processes from spawning for identical spawn specs.
 * - Closes and terminates the session if rolled out of cache.
 */
runClient.memo = memo(
  runClient,
  {
    cacheLimit: 1,
    onCacheRollout: async ({ removed }) => {
      const results = await Promise.allSettled(removed);

      for (const result of results) {
        if (result.status === 'fulfilled') {
          const session = result.value;

          try {
            await session?.close();
          } catch (error) {
            // Avoid engaging the contextual log channel on rollout.
            console.error(`Error closing interactive client: ${error}`);
          }
        } else {
          // Avoid engaging the contextual log channel on rollout.
          console.error(`Error cleaning up interactive client: ${result?.reason?.message || result?.reason || 'Unknown error'}`);
        }
      }
    }
  }
);

export {
  renderClientResourceText,
  runClient,
  parseResourceLinks,
  type ClientInstance,
  type ClientOptions,
  type ClientSettings,
  type ResourceLinkItem,
  type ClientResourceReadResult
};
