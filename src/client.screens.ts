import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stdin as input, stdout as output } from 'node:process';
import {
  clearTerminal,
  copyTextToClipboard,
  enterAlternateScreen,
  isClipboardAvailable,
  leaveAlternateScreen,
  prepareReaderDisplay
} from './client.helpers';
import { createKeyReader, promptLine, type KeyReader } from './client.input';
import { type ClientInstance, type ResourceLinkItem } from './client';

/**
 * Maximum terminal display characters.
 */
const MAX_TERMINAL_DISPLAY_CHARS = 512_000;

interface CollectionGroup {
  groupId: string;
  name: string;
  records: ResourceLinkItem[];
  isExpanded: boolean;
}

type TreeItem =
  | { kind: 'collection'; group: CollectionGroup } |
  { kind: 'record'; item: ResourceLinkItem; parentGroup?: CollectionGroup };

interface SearchScreenState {
  query: string;
  activeCollectionFilter?: string | undefined;
  availableCollections?: string[] | undefined;
  results: ResourceLinkItem[];
  collectionGroups: CollectionGroup[];
  flatVisibleTree: TreeItem[];
  selectedIndex: number;
}

type ReaderAction = 'back' | 'quit';

/**
 * Resolve current terminal column width with an 80-column fallback.
 *
 * @returns Terminal width in columns.
 */
const terminalWidth = (): number => output.columns ?? 80;

/**
 * Calculate available viewport height for reader body text.
 *
 * @returns Usable lines for content scrolling.
 */
const readerBodyRows = (): number => Math.max(8, (output.rows ?? 24) - 10);

/**
 * Determine badge tag for a search result item.
 *
 * @param item - Search result resource item.
 * @returns Formatted badge label string.
 */
const badgeForResult = (item: ResourceLinkItem): string => {
  if (item.uri.includes('/records/') || item.uri.startsWith('patternfly://records/')) {
    return '[Record]';
  }

  if (item.name.includes('(Collection)')) {
    return '[Collection]';
  }

  return '[Record]';
};

/**
 * Check if a string is a 32- or 40-character hexadecimal hash.
 *
 * @param val - String value to inspect.
 * @returns True if value is an MD5/SHA hash string.
 */
const isHexHash = (val: string): boolean => /^[a-f0-9]{32,40}$/i.test(val);

/**
 * Derive a user-friendly group title, omitting raw hash IDs.
 *
 * @param rawName - Raw collection or group name.
 * @param records - Collection item records.
 * @returns Sanitized display name.
 */
const deriveCleanGroupName = (rawName: string, records: ResourceLinkItem[]): string => {
  if (rawName && !isHexHash(rawName)) {
    return rawName;
  }

  const first = records[0];

  if (!first) {
    return 'Component';
  }

  const clean = first.name.replace(/\s*\(v\d+\)/i, '').split(/\s+[-—]\s+/)[0]?.trim();

  return clean || 'Component';
};

/**
 * Build collapsible collection groups from a flat search result list.
 *
 * @param results - Flat array of search result items.
 * @param [previousExpanded] - Set of group IDs that were previously expanded.
 * @returns Structured collection groups.
 */
const buildCollectionTree = (
  results: ResourceLinkItem[],
  previousExpanded = new Set<string>()
): CollectionGroup[] => {
  const groupMap = new Map<string, CollectionGroup>();

  for (const item of results) {
    const gid = item.groupId || item.uri.split('/').pop() || 'general';
    const isCollection = item.name.includes('(Collection)');

    if (isCollection) {
      const rawName = item.name.replace(/\s*\(Collection\)/, '').trim();

      if (!groupMap.has(gid)) {
        groupMap.set(gid, {
          groupId: gid,
          name: rawName,
          records: [],
          isExpanded: previousExpanded.has(gid)
        });
      } else if (!isHexHash(rawName)) {
        groupMap.get(gid)!.name = rawName;
      }
    } else {
      if (!groupMap.has(gid)) {
        groupMap.set(gid, {
          groupId: gid,
          name: gid,
          records: [],
          isExpanded: previousExpanded.has(gid)
        });
      }
      groupMap.get(gid)!.records.push(item);
    }
  }

  // Purge any collection that ended up with 0 child records in search results
  const activeGroups = Array.from(groupMap.values()).filter(group => group.records.length > 0);

  // Sanitize group titles so hashes never display to users
  for (const group of activeGroups) {
    group.name = deriveCleanGroupName(group.name, group.records);
  }

  // Auto-expand if only 1 collection group exists and no prior state was tracked
  if (activeGroups.length === 1 && previousExpanded.size === 0 && activeGroups[0]) {
    activeGroups[0].isExpanded = true;
  }

  return activeGroups;
};

/**
 * Flatten hierarchical collection groups into a linear list of tree items.
 *
 * @param groups - Array of collection groups.
 * @returns Flat list of collection and record items for terminal display.
 */
const flattenTree = (groups: CollectionGroup[]): TreeItem[] => {
  const flat: TreeItem[] = [];

  // Multi-record groups (>= 2 records) render as collapsible collections
  const multiRecordGroups = groups.filter(group => group.records.length >= 2);
  // Single-record groups (== 1 record) render directly as top-level records
  const singleRecordGroups = groups.filter(group => group.records.length === 1);

  for (const group of multiRecordGroups) {
    flat.push({ kind: 'collection', group });
    if (group.isExpanded) {
      for (const record of group.records) {
        flat.push({ kind: 'record', item: record, parentGroup: group });
      }
    }
  }

  for (const group of singleRecordGroups) {
    const record = group.records[0];

    if (record) {
      flat.push({ kind: 'record', item: record });
    }
  }

  return flat;
};

/**
 * Cycle through available collection filters on Tab keystroke.
 *
 * @param collections - Available collection names.
 * @param [current] - Current active collection filter name.
 * @returns Next collection filter or undefined if reset to all.
 */
const cycleCollectionFilter = (
  collections: string[],
  current?: string
): string | undefined => {
  if (!collections?.length) {
    return undefined;
  }
  if (!current) {
    return collections[0];
  }
  const idx = collections.indexOf(current);

  if (idx === -1) {
    return collections[0];
  }

  if (idx === collections.length - 1) {
    return undefined;
  }

  return collections[idx + 1];
};

/**
 * Hard-wrap lines of text to fit within terminal width.
 *
 * @param text - Text content to wrap.
 * @param width - Maximum line character width.
 * @returns Array of wrapped lines.
 */
const wrapLines = (text: string, width: number): string[] => {
  const lines: string[] = [];

  text.split('\n').forEach(line => {
    if (line.length <= width) {
      lines.push(line);

      return;
    }

    let rest = line;

    while (rest.length > width) {
      lines.push(rest.slice(0, width));
      rest = rest.slice(width);
    }

    if (rest.length) {
      lines.push(rest);
    }
  });

  return lines;
};

/**
 * Render search screen header, filter status, and tree results.
 *
 * @param state - Current search screen state.
 */
const renderSearchScreen = (state: SearchScreenState): void => {
  clearTerminal();
  const width = terminalWidth();
  const maxVisibleRows = Math.max(5, (output.rows ?? 24) - 8);
  const totalRecords = state.collectionGroups.reduce((acc, group) => acc + group.records.length, 0);
  const collectionCount = state.collectionGroups.filter(group => group.records.length >= 2).length;
  const filterLabel = state.activeCollectionFilter ? `<${state.activeCollectionFilter}>` : '<Closest match>';

  output.write(`\n  ◇ PatternFly Search: "${state.query}"  ·  Filter: ${filterLabel}  (${collectionCount} collections, ${totalRecords} records)\n\n`);

  if (!totalRecords) {
    output.write('  No matches yet. Press </> to change query or <q> to quit.\n\n');
  }

  const totalItems = state.flatVisibleTree.length;
  let startIdx = 0;
  let endIdx = totalItems;

  if (totalItems > maxVisibleRows) {
    const half = Math.floor(maxVisibleRows / 2);

    startIdx = Math.max(0, Math.min(state.selectedIndex - half, totalItems - maxVisibleRows));
    endIdx = Math.min(totalItems, startIdx + maxVisibleRows);
  }

  for (let index = startIdx; index < endIdx; index++) {
    const treeItem = state.flatVisibleTree[index];

    if (!treeItem) {
      continue;
    }

    const marker = index === state.selectedIndex ? '◉' : '○';

    if (treeItem.kind === 'collection') {
      const exp = treeItem.group.isExpanded ? '▼' : '▸';
      const label = `${marker} ${exp} [Collection] ${treeItem.group.name} [${treeItem.group.records.length} records]`;

      output.write(`  ${label.slice(0, width - 4)}\n`);
    } else if (treeItem.parentGroup) {
      const label = `    ${marker} [Record] ${treeItem.item.name}`;

      output.write(`  ${label.slice(0, width - 4)}\n`);
    } else {
      const label = `${marker}   [Record] ${treeItem.item.name}`;

      output.write(`  ${label.slice(0, width - 4)}\n`);
    }
  }

  if (totalItems > maxVisibleRows) {
    const remaining = totalItems - endIdx;
    const prev = startIdx;

    output.write(`  … [showing ${startIdx + 1}-${endIdx} of ${totalItems} items${remaining > 0 ? ` · ${remaining} more below` : ''}${prev > 0 ? ` · ${prev} above` : ''}]\n`);
  }

  output.write('\n  [<↑/↓> navigate · <Enter> submit or select · <Tab> filter · </> search · <q> quit]\n');
};

/**
 * Render resource viewer screen with bordered box and pagination status.
 *
 * @param uri - Resource URI displayed in title bar.
 * @param titleLine - Title line extracted from markdown.
 * @param bodyLines - Wrapped document body lines.
 * @param scrollOffset - Current line offset in document.
 * @param [statusNote] - Transient note (e.g. copy or save feedback).
 * @param [clipboardEnabled] - Whether clipboard action is enabled in footer.
 */
const renderReaderScreen = (
  uri: string,
  titleLine: string,
  bodyLines: string[],
  scrollOffset: number,
  statusNote = '',
  clipboardEnabled = true
): void => {
  clearTerminal();
  const width = terminalWidth();
  const innerWidth = width - 4;
  const viewport = readerBodyRows();
  const visible = bodyLines.slice(scrollOffset, scrollOffset + viewport);
  const total = bodyLines.length;
  const scrollEnd = Math.min(total, scrollOffset + visible.length);
  const scrollLabel = total ? `lines ${scrollOffset + 1}-${scrollEnd} of ${total}` : 'empty';

  output.write(`\n  ┌── ${uri} ${'─'.repeat(Math.max(0, innerWidth - uri.length - 5))}\n`);
  wrapLines(titleLine, innerWidth).forEach(line => {
    output.write(`  │ ${line.padEnd(innerWidth)}\n`);
  });
  output.write(`  ├${'─'.repeat(innerWidth + 1)}\n`);

  if (!visible.length) {
    output.write(`  │ ${'(no content)'.padEnd(innerWidth)}\n`);
  }

  visible.forEach(line => {
    output.write(`  │ ${line.padEnd(innerWidth)}\n`);
  });

  output.write(`  └${'─'.repeat(innerWidth + 1)}\n`);
  output.write(`\n  ${scrollLabel}${statusNote ? `  ·  ${statusNote}` : ''}\n`);
  const copyHint = clipboardEnabled ? '<c> copy · ' : '';

  output.write(`  [<↑/↓/PgUp/PgDn/Space> scroll · <Enter/b> back · ${copyHint}<r> save .md · <q> quit]\n`);
};

/**
 * Truncate large document text to avoid terminal memory and rendering limits.
 *
 * @param fullText - Full document body text.
 * @param clipboardEnabled - Whether clipboard copy is available.
 * @returns Display text truncated if beyond threshold.
 */
const displayTextForTerminal = (fullText: string, clipboardEnabled: boolean): string => {
  if (fullText.length <= MAX_TERMINAL_DISPLAY_CHARS) {
    return fullText;
  }

  const omitted = fullText.length - MAX_TERMINAL_DISPLAY_CHARS;
  const exportHint = clipboardEnabled ? '[c] copy or [r] save full file' : '[r] save full file';

  return `${fullText.slice(0, MAX_TERMINAL_DISPLAY_CHARS)}\n\n… [${omitted} characters hidden in view — ${exportHint}]`;
};

/**
 * Generate sanitized local file name for saving a resource.
 *
 * @param uri - Resource URI.
 * @returns Sanitized markdown file name.
 */
const markdownFileNameForUri = (uri: string): string => {
  const tail = uri.split('/').pop()?.split('?')[0] ?? 'resource';
  const safe = tail.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'resource';

  return `patternfly-${safe.slice(0, 64)}.md`;
};

/**
 * Prompt for search query input while preserving screen buffer, header, and control footer.
 *
 * @param keys - Key reader instance to disable during line input.
 * @param state - Current search screen state providing filter and result context.
 * @returns New query input string.
 */
const promptForSearchQuery = async (keys: KeyReader, state: SearchScreenState): Promise<string> => {
  keys.disable();
  clearTerminal();

  const filterLabel = state.activeCollectionFilter ? `<${state.activeCollectionFilter}>` : '<Closest match>';
  const totalRecords = state.collectionGroups.reduce((acc, group) => acc + group.records.length, 0);
  const collectionCount = state.collectionGroups.filter(group => group.records.length >= 2).length;
  const queryDisplay = state.query ? `"${state.query}"` : '""';

  output.write(`\n  ◇ PatternFly Search: ${queryDisplay}  ·  Filter: ${filterLabel}  (${collectionCount} collections, ${totalRecords} records)\n\n`);

  if (state.query) {
    output.write('  [Enter new search · empty keeps previous search]\n');
  } else {
    output.write('  [Enter search term · <Enter> submit]\n');
  }

  const query = await promptLine({ label: '  Search', current: state.query });

  output.write('\n  [<↑/↓> navigate · <Enter> submit or select · <Tab> filter · </> search · <q> quit]\n');

  keys.enable();

  return query.trim();
};

/**
 * Run search-and-select screen until the user opens a result or quits.
 *
 * @param session - Connected MCP client session.
 * @param initialState - Query, results, and selection index.
 * @param keys - Shared TTY key reader for the interactive session.
 */
const runSearchScreen = async (
  session: ClientInstance,
  initialState: SearchScreenState,
  keys: KeyReader
): Promise<{ action: 'quit' } | { action: 'open'; uri: string; state: SearchScreenState }> => {
  const state: SearchScreenState = { ...initialState };

  if (!state.availableCollections?.length) {
    const serverCollections = typeof session.listCollections === 'function'
      ? session.listCollections()
      : [];

    if (serverCollections.length > 0) {
      state.availableCollections = serverCollections;
    } else if (state.results?.length) {
      state.availableCollections = Array.from(
        new Set(state.results.map(item => item.primaryCollection).filter((col): col is string => Boolean(col)))
      ).sort();
    }
  }

  if (!state.collectionGroups || !state.flatVisibleTree) {
    if (!state.results?.length && state.query) {
      state.results = await session.search(state.query, state.activeCollectionFilter);
    }
    state.collectionGroups = buildCollectionTree(state.results || []);
    state.flatVisibleTree = flattenTree(state.collectionGroups);
    state.selectedIndex = Math.min(
      Math.max(0, state.selectedIndex || 0),
      Math.max(0, state.flatVisibleTree.length - 1)
    );
  }

  while (true) {
    renderSearchScreen(state);
    const key = await keys.readKey();

    if (key === 'q' || key === 'ctrl-c') {
      Object.assign(initialState, state);

      return { action: 'quit' };
    }

    if (key === 'up') {
      state.selectedIndex = Math.max(0, state.selectedIndex - 1);
      continue;
    }

    if (key === 'down') {
      state.selectedIndex = Math.min(Math.max(0, state.flatVisibleTree.length - 1), state.selectedIndex + 1);
      continue;
    }

    if (key === 'tab') {
      state.activeCollectionFilter = cycleCollectionFilter(
        state.availableCollections ?? [],
        state.activeCollectionFilter
      );
      if (state.query) {
        const previousExpanded = new Set(
          state.collectionGroups.filter(group => group.isExpanded).map(group => group.groupId)
        );

        state.results = await session.search(state.query, state.activeCollectionFilter);
        state.collectionGroups = buildCollectionTree(state.results, previousExpanded);
        state.flatVisibleTree = flattenTree(state.collectionGroups);
        state.selectedIndex = Math.min(
          Math.max(0, state.selectedIndex),
          Math.max(0, state.flatVisibleTree.length - 1)
        );
      }
      continue;
    }

    if (key === 'right') {
      const selected = state.flatVisibleTree[state.selectedIndex];

      if (selected?.kind === 'collection') {
        const targetGroupId = selected.group.groupId;

        for (const group of state.collectionGroups) {
          group.isExpanded = group.groupId === targetGroupId;
        }

        state.flatVisibleTree = flattenTree(state.collectionGroups);
        const newIndex = state.flatVisibleTree.findIndex(
          item => item.kind === 'collection' && item.group.groupId === targetGroupId
        );

        if (newIndex !== -1) {
          state.selectedIndex = newIndex;
        }
      }
      continue;
    }

    if (key === 'left') {
      const selected = state.flatVisibleTree[state.selectedIndex];

      if (selected?.kind === 'collection') {
        selected.group.isExpanded = false;
        state.flatVisibleTree = flattenTree(state.collectionGroups);
        state.selectedIndex = Math.min(
          Math.max(0, state.selectedIndex),
          Math.max(0, state.flatVisibleTree.length - 1)
        );
      }
      continue;
    }

    if (key === '/') {
      const newQuery = await promptForSearchQuery(keys, state);

      if (newQuery !== state.query) {
        state.query = newQuery;

        state.results = await session.search(state.query, state.activeCollectionFilter);
        state.collectionGroups = buildCollectionTree(state.results);
        state.flatVisibleTree = flattenTree(state.collectionGroups);
        state.selectedIndex = 0;
      }
      continue;
    }

    if (key === 'enter') {
      const selected = state.flatVisibleTree[state.selectedIndex];

      if (selected?.kind === 'collection') {
        const targetGroupId = selected.group.groupId;
        const willExpand = !selected.group.isExpanded;

        for (const group of state.collectionGroups) {
          group.isExpanded = willExpand ? group.groupId === targetGroupId : false;
        }

        state.flatVisibleTree = flattenTree(state.collectionGroups);
        const newIndex = state.flatVisibleTree.findIndex(
          item => item.kind === 'collection' && item.group.groupId === targetGroupId
        );

        if (newIndex !== -1) {
          state.selectedIndex = newIndex;
        } else {
          state.selectedIndex = Math.min(
            Math.max(0, state.selectedIndex),
            Math.max(0, state.flatVisibleTree.length - 1)
          );
        }
        continue;
      }

      if (selected?.kind === 'record') {
        Object.assign(initialState, state);

        return {
          action: 'open',
          uri: selected.item.uri,
          state: { ...state }
        };
      }
    }
  }
};

/**
 * Show a single resource and handle reader shortcuts.
 *
 * @param session - Connected MCP client session.
 * @param uri - Resource URI to load.
 * @param keys - Shared TTY key reader for the interactive session.
 * @param clipboardEnabled - When false, copy shortcut is hidden and ignored.
 */
const runReaderScreen = async (
  session: ClientInstance,
  uri: string,
  keys: KeyReader,
  clipboardEnabled: boolean
): Promise<ReaderAction> => {
  const { text: fullText } = await session.readResource(uri);
  const { titleLine, body: displayBody } = prepareReaderDisplay({ fullText, uri });
  const body = displayTextForTerminal(displayBody, clipboardEnabled);
  const innerWidth = terminalWidth() - 4;
  const bodyLines = wrapLines(body, innerWidth);
  let scrollOffset = 0;
  let statusNote = '';

  const maxScroll = (): number => Math.max(0, bodyLines.length - readerBodyRows());

  while (true) {
    renderReaderScreen(uri, titleLine, bodyLines, scrollOffset, statusNote, clipboardEnabled);
    statusNote = '';
    const key = await keys.readKey();

    if (key === 'b' || key === 'esc' || key === 'enter') {
      return 'back';
    }

    if (key === 'q' || key === 'ctrl-c') {
      return 'quit';
    }

    if (key === 'up') {
      scrollOffset = Math.max(0, scrollOffset - 1);
      continue;
    }

    if (key === 'down') {
      scrollOffset = Math.min(maxScroll(), scrollOffset + 1);
      continue;
    }

    if (key === 'pageup') {
      scrollOffset = Math.max(0, scrollOffset - readerBodyRows());
      continue;
    }

    if (key === 'pagedown' || key === 'space') {
      scrollOffset = Math.min(maxScroll(), scrollOffset + readerBodyRows());
      continue;
    }

    if (key === 'c' && clipboardEnabled) {
      const copyResult = copyTextToClipboard(fullText);

      statusNote = copyResult.message;
      continue;
    }

    if (key === 'r') {
      const fileName = markdownFileNameForUri(uri);
      const filePath = join(process.cwd(), fileName);

      try {
        await writeFile(filePath, fullText, 'utf8');
        statusNote = `Saved ${fullText.length} chars to ${fileName}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        statusNote = `Save failed: ${message}`;
      }

      continue;
    }
  }
};

/**
 * Interactive two-screen search and read loop for TTY sessions.
 *
 * @param session - Connected MCP client session.
 * @param initialQuery - Optional initial search string (prompts when empty).
 * @param initialCollection - Optional initial collection filter.
 */
const runInteractiveClient = async (
  session: ClientInstance,
  initialQuery = '',
  initialCollection?: string
): Promise<void> => {
  if (!input.isTTY || !output.isTTY) {
    throw new Error('Interactive client requires a TTY.');
  }

  let query = initialQuery.trim();

  if (!query) {
    clearTerminal();
    output.write('\n  ◇ PatternFly Search: ""  ·  Filter: <Closest match>  (0 collections, 0 records)\n\n');
    output.write('  [Enter search term · <Enter> submit]\n');
    query = await promptLine({ label: '  Search' });

    if (!query) {
      return;
    }
  }

  const keys = createKeyReader();
  const clipboardEnabled = isClipboardAvailable();

  enterAlternateScreen();
  keys.enable();

  const results = await session.search(query, initialCollection);
  const collectionGroups = buildCollectionTree(results);
  const flatVisibleTree = flattenTree(collectionGroups);

  let searchState: SearchScreenState = {
    query,
    activeCollectionFilter: initialCollection,
    results,
    collectionGroups,
    flatVisibleTree,
    selectedIndex: 0
  };

  try {
    while (true) {
      const searchOutcome = await runSearchScreen(session, searchState, keys);

      if (searchOutcome.action === 'quit') {
        break;
      }

      searchState = searchOutcome.state;
      const readerOutcome = await runReaderScreen(session, searchOutcome.uri, keys, clipboardEnabled);

      if (readerOutcome === 'quit') {
        break;
      }
    }
  } finally {
    keys.dispose();
    leaveAlternateScreen();
  }
};

export {
  MAX_TERMINAL_DISPLAY_CHARS,
  badgeForResult,
  buildCollectionTree,
  cycleCollectionFilter,
  flattenTree,
  renderReaderScreen,
  renderSearchScreen,
  runInteractiveClient,
  runReaderScreen,
  runSearchScreen,
  type CollectionGroup,
  type SearchScreenState,
  type TreeItem
};
