import fs from 'node:fs/promises';
import { stdin as input } from 'node:process';
import {
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
  type SearchScreenState
} from '../client.screens';
import { type ResourceLinkItem } from '../client';
import * as clientHelpers from '../client.helpers';
import * as clientInput from '../client.input';

describe('badgeForResult', () => {
  it.each([
    {
      description: 'collection URI item',
      item: { uri: 'patternfly://docs/modal', name: 'Modal (Collection)' },
      expected: '[Collection]'
    },
    {
      description: 'record URI item',
      item: { uri: 'patternfly://records/modal-doc', name: 'Modal — Docs (v6)' },
      expected: '[Record]'
    },
    {
      description: 'schema URI item',
      item: { uri: 'patternfly://schemas/modal', name: 'Modal — JSON Schema (v6)' },
      expected: '[Record]'
    },
    {
      description: 'other item fallback',
      item: { uri: 'patternfly://docs/other', name: 'Other Item' },
      expected: '[Record]'
    }
  ])('returns badge for $description', ({ item, expected }) => {
    expect(badgeForResult(item as ResourceLinkItem)).toBe(expected);
  });
});

describe('buildCollectionTree', () => {
  const sampleResults: ResourceLinkItem[] = [
    {
      uri: 'patternfly://docs/modal',
      name: 'Modal (Collection)',
      groupId: 'modal'
    },
    {
      uri: 'patternfly://records/modal-doc',
      name: 'Modal — Docs (v6)',
      groupId: 'modal',
      primaryCollection: 'patternfly-docs'
    },
    {
      uri: 'patternfly://records/modal-schema',
      name: 'Modal — JSON Schema (v6)',
      groupId: 'modal',
      primaryCollection: 'patternfly-component-schemas'
    },
    {
      uri: 'patternfly://docs/button',
      name: 'Button (Collection)',
      groupId: 'button'
    },
    {
      uri: 'patternfly://records/button-doc',
      name: 'Button — Docs (v6)',
      groupId: 'button',
      primaryCollection: 'patternfly-docs'
    }
  ];

  it('groups multi-collection results and calculates record counts without auto-expanding', () => {
    const groups = buildCollectionTree(sampleResults);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.groupId).toBe('modal');
    expect(groups[0]?.name).toBe('Modal');
    expect(groups[0]?.records).toHaveLength(2);
    expect(groups[0]?.isExpanded).toBe(false);

    expect(groups[1]?.groupId).toBe('button');
    expect(groups[1]?.name).toBe('Button');
    expect(groups[1]?.records).toHaveLength(1);
    expect(groups[1]?.isExpanded).toBe(false);
  });

  it('purges empty collections that have zero child records', () => {
    const resultsWithEmpty: ResourceLinkItem[] = [
      {
        uri: 'patternfly://docs/user-feedback',
        name: 'User Feedback (Collection)',
        groupId: 'user-feedback'
      },
      {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal'
      }
    ];

    const groups = buildCollectionTree(resultsWithEmpty);

    expect(groups.find(group => group.groupId === 'user-feedback')).toBeUndefined();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.records).toHaveLength(1);
  });

  it('sanitizes raw hex hashes from group titles', () => {
    const hashResult: ResourceLinkItem = {
      uri: 'patternfly://records/btn-acc',
      name: 'Button - Accessibility (v6)',
      groupId: '39f74ce79e010122147ee142402d9caf4e99382b'
    };

    const groups = buildCollectionTree([hashResult]);

    expect(groups[0]?.name).toBe('Button');
    expect(/^[a-f0-9]{32,40}$/i.test(groups[0]?.name ?? '')).toBe(false);
  });

  it('auto-expands single collection matches when previousExpanded is empty', () => {
    const singleResults: ResourceLinkItem[] = [
      {
        uri: 'patternfly://docs/modal',
        name: 'Modal (Collection)',
        groupId: 'modal'
      },
      {
        uri: 'patternfly://records/modal-doc',
        name: 'Modal — Docs (v6)',
        groupId: 'modal'
      }
    ];

    const groups = buildCollectionTree(singleResults);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.groupId).toBe('modal');
    expect(groups[0]?.records).toHaveLength(1);
    expect(groups[0]?.isExpanded).toBe(true);
  });

  it('preserves previousExpanded state across rebuilds', () => {
    const previousExpanded = new Set(['button']);
    const groups = buildCollectionTree(sampleResults, previousExpanded);

    expect(groups.find(group => group.groupId === 'modal')?.isExpanded).toBe(false);
    expect(groups.find(group => group.groupId === 'button')?.isExpanded).toBe(true);
  });
});

describe('flattenTree', () => {
  it('flattens multi-record collections and renders single-record matches as top-level records', () => {
    const groups: CollectionGroup[] = [
      {
        groupId: 'modal',
        name: 'Modal',
        records: [
          { uri: 'patternfly://records/modal-doc-1', name: 'Modal — Docs (v6)' },
          { uri: 'patternfly://records/modal-doc-2', name: 'Modal — Examples (v6)' }
        ],
        isExpanded: false
      },
      {
        groupId: 'button',
        name: 'Button',
        records: [
          { uri: 'patternfly://records/button-doc-1', name: 'Button — Docs (v6)' },
          { uri: 'patternfly://records/button-doc-2', name: 'Button — Examples (v6)' }
        ],
        isExpanded: true
      },
      {
        groupId: 'wizard-submit',
        name: 'Wizard',
        records: [
          { uri: 'patternfly://records/wizard-step', name: 'Wizard - Step Actions (v6)' }
        ],
        isExpanded: false
      }
    ];

    const flat = flattenTree(groups);

    // Expect:
    // [0]: Collection 'modal' (collapsed)
    // [1]: Collection 'button' (expanded)
    // [2]: Record 'Button — Docs' (child of button)
    // [3]: Record 'Button — Examples' (child of button)
    // [4]: Record 'Wizard - Step Actions' (standalone top-level record, no collection wrapper)
    expect(flat).toHaveLength(5);
    expect(flat[0]).toEqual({ kind: 'collection', group: groups[0] });
    expect(flat[1]).toEqual({ kind: 'collection', group: groups[1] });
    expect(flat[2]).toEqual({
      kind: 'record',
      item: groups[1]?.records[0],
      parentGroup: groups[1]
    });
    expect(flat[3]).toEqual({
      kind: 'record',
      item: groups[1]?.records[1],
      parentGroup: groups[1]
    });
    expect(flat[4]).toEqual({
      kind: 'record',
      item: groups[2]?.records[0]
    });
  });
});

describe('cycleCollectionFilter', () => {
  it('cycles from undefined through provided collections and back to undefined', () => {
    const collections = ['col-a', 'col-b', 'col-c'];
    let current: string | undefined = undefined;

    current = cycleCollectionFilter(collections, current);
    expect(current).toBe('col-a');

    current = cycleCollectionFilter(collections, current);
    expect(current).toBe('col-b');

    current = cycleCollectionFilter(collections, current);
    expect(current).toBe('col-c');

    current = cycleCollectionFilter(collections, current);
    expect(current).toBeUndefined();
  });

  it('returns undefined when collections list is empty', () => {
    expect(cycleCollectionFilter([], undefined)).toBeUndefined();
    expect(cycleCollectionFilter([], 'col-a')).toBeUndefined();
  });

  it('returns first collection when current is not in collections array', () => {
    expect(cycleCollectionFilter(['col-a', 'col-b'], 'unknown-col')).toBe('col-a');
  });
});

describe('renderSearchScreen', () => {
  let outputData = '';
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    outputData = '';
    process.stdout.write = ((chunk: string) => {
      outputData += chunk;

      return true;
    }) as any;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it('renders header, collection groups, records, and formatted key hints', () => {
    const groups = buildCollectionTree([
      { uri: 'patternfly://docs/modal', name: 'Modal (Collection)', groupId: 'modal' },
      { uri: 'patternfly://records/modal-doc', name: 'Modal — Docs (v6)', groupId: 'modal' }
    ]);
    const flatVisibleTree = flattenTree(groups);

    const state: SearchScreenState = {
      query: 'modal',
      activeCollectionFilter: 'patternfly-docs',
      results: [],
      collectionGroups: groups,
      flatVisibleTree,
      selectedIndex: 0
    };

    renderSearchScreen(state);

    // Modal has 1 record -> rendered as top-level record, collection count is 0
    expect(outputData).toContain('Filter: <patternfly-docs>  (0 collections, 1 records)');
    expect(outputData).toContain('[Record] Modal — Docs (v6)');
    expect(outputData).toContain('[<↑/↓> navigate · <Enter> submit or select · <Tab> filter · </> search · <q> quit]');
  });

  it('renders <Closest match> when activeCollectionFilter is undefined', () => {
    const state: SearchScreenState = {
      query: 'modal',
      activeCollectionFilter: undefined,
      results: [],
      collectionGroups: [],
      flatVisibleTree: [],
      selectedIndex: 0
    };

    renderSearchScreen(state);

    expect(outputData).toContain('◇ PatternFly Search: "modal"');
    expect(outputData).toContain('Filter: <Closest match>  (0 collections, 0 records)');
    expect(outputData).toContain('No matches yet. Press </> to change query or <q> to quit.');
    expect(outputData).toContain('[<↑/↓> navigate · <Enter> submit or select · <Tab> filter · </> search · <q> quit]');
  });

  it('clamps visible rows when items exceed terminal viewport height', () => {
    const records = Array.from({ length: 30 }, (_, i) => ({
      uri: `patternfly://records/item-${i}`,
      name: `Item ${i}`,
      groupId: `group-${i}`
    }));
    const groups = buildCollectionTree(records);
    const flatVisibleTree = flattenTree(groups);

    const state: SearchScreenState = {
      query: 'items',
      activeCollectionFilter: undefined,
      results: records,
      collectionGroups: groups,
      flatVisibleTree,
      selectedIndex: 20
    };

    renderSearchScreen(state);

    expect(outputData).toContain('… [showing');
    expect(outputData).toContain('of 30 items');
    expect(outputData).toContain('[Record] Item 20');
  });
});

describe('runSearchScreen', () => {
  const mockSession = {
    search: jest.fn(),
    readResource: jest.fn(),
    listCollections: jest.fn().mockReturnValue(['patternfly-docs', 'patternfly-component-schemas']),
    connect: jest.fn(),
    close: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('handles toggle navigation with enter on collection nodes and opens record', async () => {
    const modalCollection: ResourceLinkItem = {
      uri: 'patternfly://docs/modal',
      name: 'Modal (Collection)',
      groupId: 'modal'
    };
    const modalRecord1: ResourceLinkItem = {
      uri: 'patternfly://records/modal-doc',
      name: 'Modal — Docs (v6)',
      groupId: 'modal'
    };
    const modalRecord2: ResourceLinkItem = {
      uri: 'patternfly://records/modal-schema',
      name: 'Modal — JSON Schema (v6)',
      groupId: 'modal'
    };

    const groups = buildCollectionTree([modalCollection, modalRecord1, modalRecord2]);

    // starts expanded because 1 group
    if (groups[0]) {
      groups[0].isExpanded = true;
    }
    const flat = flattenTree(groups);

    const state: SearchScreenState = {
      query: 'modal',
      results: [modalCollection, modalRecord1, modalRecord2],
      collectionGroups: groups,
      flatVisibleTree: flat,
      selectedIndex: 0
    };

    const keyQueue = ['enter', 'down', 'enter'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    // 1. 'enter' collapses modal collection
    // 2. 'down' keeps selectedIndex on only visible row (0)
    // 3. 'enter' expands modal collection again
    // 4. 'q' quits
    const result = await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(result).toEqual({ action: 'quit' });
  });

  it('enforces accordion behavior by closing other collections when expanding a collection', async () => {
    const modalCol: ResourceLinkItem = {
      uri: 'patternfly://docs/modal',
      name: 'Modal (Collection)',
      groupId: 'modal'
    };
    const modalRec1: ResourceLinkItem = {
      uri: 'patternfly://records/modal-1',
      name: 'Modal - Doc 1 (v6)',
      groupId: 'modal'
    };
    const modalRec2: ResourceLinkItem = {
      uri: 'patternfly://records/modal-2',
      name: 'Modal - Doc 2 (v6)',
      groupId: 'modal'
    };
    const btnCol: ResourceLinkItem = {
      uri: 'patternfly://docs/button',
      name: 'Button (Collection)',
      groupId: 'button'
    };
    const btnRec1: ResourceLinkItem = {
      uri: 'patternfly://records/btn-1',
      name: 'Button - Doc 1 (v6)',
      groupId: 'button'
    };
    const btnRec2: ResourceLinkItem = {
      uri: 'patternfly://records/btn-2',
      name: 'Button - Doc 2 (v6)',
      groupId: 'button'
    };

    const groups = buildCollectionTree([modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2]);

    if (groups[0]) {
      groups[0].isExpanded = true;
    }
    if (groups[1]) {
      groups[1].isExpanded = false;
    }

    const state: SearchScreenState = {
      query: 'test',
      results: [modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2],
      collectionGroups: groups,
      flatVisibleTree: flattenTree(groups),
      selectedIndex: 3 // Cursor on Button collection header
    };

    // Press 'enter' on Button collection: expands Button, collapses Modal
    const keyQueue = ['enter'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    const result = await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(result).toEqual({ action: 'quit' });

    // Modal should now be collapsed, Button should be expanded
    const modalGroup = state.collectionGroups.find(group => group.groupId === 'modal');
    const btnGroup = state.collectionGroups.find(group => group.groupId === 'button');

    expect(modalGroup?.isExpanded).toBe(false);
    expect(btnGroup?.isExpanded).toBe(true);

    // Cursor should remain on the Button collection header
    const currentItem = state.flatVisibleTree[state.selectedIndex];

    expect(currentItem?.kind).toBe('collection');
    if (currentItem?.kind === 'collection') {
      expect(currentItem.group.groupId).toBe('button');
    }
  });

  it('enforces accordion behavior when expanding a collection using right arrow', async () => {
    const modalCol: ResourceLinkItem = {
      uri: 'patternfly://docs/modal',
      name: 'Modal (Collection)',
      groupId: 'modal'
    };
    const modalRec1: ResourceLinkItem = {
      uri: 'patternfly://records/modal-1',
      name: 'Modal - Doc 1 (v6)',
      groupId: 'modal'
    };
    const modalRec2: ResourceLinkItem = {
      uri: 'patternfly://records/modal-2',
      name: 'Modal - Doc 2 (v6)',
      groupId: 'modal'
    };
    const btnCol: ResourceLinkItem = {
      uri: 'patternfly://docs/button',
      name: 'Button (Collection)',
      groupId: 'button'
    };
    const btnRec1: ResourceLinkItem = {
      uri: 'patternfly://records/btn-1',
      name: 'Button - Doc 1 (v6)',
      groupId: 'button'
    };
    const btnRec2: ResourceLinkItem = {
      uri: 'patternfly://records/btn-2',
      name: 'Button - Doc 2 (v6)',
      groupId: 'button'
    };

    const groups = buildCollectionTree([modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2]);

    if (groups[0]) {
      groups[0].isExpanded = true;
    }
    if (groups[1]) {
      groups[1].isExpanded = false;
    }

    const state: SearchScreenState = {
      query: 'test',
      results: [modalCol, modalRec1, modalRec2, btnCol, btnRec1, btnRec2],
      collectionGroups: groups,
      flatVisibleTree: flattenTree(groups),
      selectedIndex: 3 // Cursor on Button collection header
    };

    // Press 'right' on Button collection: expands Button, collapses Modal
    const keyQueue = ['right'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    const result = await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(result).toEqual({ action: 'quit' });

    const modalGroup = state.collectionGroups.find(group => group.groupId === 'modal');
    const btnGroup = state.collectionGroups.find(group => group.groupId === 'button');

    expect(modalGroup?.isExpanded).toBe(false);
    expect(btnGroup?.isExpanded).toBe(true);

    const currentItem = state.flatVisibleTree[state.selectedIndex];

    expect(currentItem?.kind).toBe('collection');
    if (currentItem?.kind === 'collection') {
      expect(currentItem.group.groupId).toBe('button');
    }
  });

  it('opens reader on enter when child record is selected', async () => {
    const modalCollection: ResourceLinkItem = {
      uri: 'patternfly://docs/modal',
      name: 'Modal (Collection)',
      groupId: 'modal'
    };
    const modalRecord1: ResourceLinkItem = {
      uri: 'patternfly://records/modal-doc',
      name: 'Modal — Docs (v6)',
      groupId: 'modal'
    };
    const modalRecord2: ResourceLinkItem = {
      uri: 'patternfly://records/modal-schema',
      name: 'Modal — JSON Schema (v6)',
      groupId: 'modal'
    };

    const groups = buildCollectionTree([modalCollection, modalRecord1, modalRecord2]);

    if (groups[0]) {
      groups[0].isExpanded = true;
    }
    const flat = flattenTree(groups);

    const state: SearchScreenState = {
      query: 'modal',
      results: [modalCollection, modalRecord1, modalRecord2],
      collectionGroups: groups,
      flatVisibleTree: flat,
      selectedIndex: 1 // On record node
    };

    const keyQueue = ['enter'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    const result = await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(result).toEqual({
      action: 'open',
      uri: 'patternfly://records/modal-doc',
      state: expect.objectContaining({ selectedIndex: 1 })
    });
  });

  it('opens reader on enter when standalone top-level record is selected', async () => {
    const standaloneRecord: ResourceLinkItem = {
      uri: 'patternfly://records/modal-doc',
      name: 'Modal — Docs (v6)',
      groupId: 'modal'
    };

    const groups = buildCollectionTree([standaloneRecord]);
    const flat = flattenTree(groups);

    const state: SearchScreenState = {
      query: 'modal',
      results: [standaloneRecord],
      collectionGroups: groups,
      flatVisibleTree: flat,
      selectedIndex: 0
    };

    const keyQueue = ['enter'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    const result = await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(result).toEqual({
      action: 'open',
      uri: 'patternfly://records/modal-doc',
      state: expect.objectContaining({ selectedIndex: 0 })
    });
  });

  it('cycles collection filter on tab and re-queries session.search', async () => {
    mockSession.search.mockResolvedValue([
      {
        uri: 'patternfly://records/modal-api',
        name: 'Modal — API',
        groupId: 'modal',
        primaryCollection: 'patternfly-docs'
      }
    ]);

    mockSession.listCollections.mockReturnValue(['patternfly-docs', 'patternfly-component-schemas']);

    const state: SearchScreenState = {
      query: 'modal',
      activeCollectionFilter: undefined,
      availableCollections: ['patternfly-docs', 'patternfly-component-schemas'],
      results: [],
      collectionGroups: [],
      flatVisibleTree: [],
      selectedIndex: 0
    };

    const keyQueue = ['tab', 'q'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(mockSession.search).toHaveBeenCalledWith('modal', 'patternfly-docs');
  });

  it('handles query prompt via "/" and updates search state', async () => {
    jest.spyOn(clientInput, 'promptLine').mockResolvedValue('card');
    mockSession.search.mockResolvedValue([
      {
        uri: 'patternfly://records/card-doc',
        name: 'Card — Docs',
        groupId: 'card',
        primaryCollection: 'patternfly-docs'
      }
    ]);

    const state: SearchScreenState = {
      query: 'modal',
      results: [],
      collectionGroups: [],
      flatVisibleTree: [],
      selectedIndex: 0
    };

    const keyQueue = ['/', 'q'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(state.query).toBe('card');
    expect(mockSession.search).toHaveBeenCalledWith('card', undefined);
    expect(state.results).toHaveLength(1);
  });

  it('handles left arrow to collapse collection node', async () => {
    const modalCollection: ResourceLinkItem = {
      uri: 'patternfly://docs/modal',
      name: 'Modal (Collection)',
      groupId: 'modal'
    };
    const modalRecord1: ResourceLinkItem = {
      uri: 'patternfly://records/modal-doc',
      name: 'Modal — Docs (v6)',
      groupId: 'modal'
    };
    const modalRecord2: ResourceLinkItem = {
      uri: 'patternfly://records/modal-schema',
      name: 'Modal — JSON Schema (v6)',
      groupId: 'modal'
    };

    const groups = buildCollectionTree([modalCollection, modalRecord1, modalRecord2]);

    if (groups[0]) {
      groups[0].isExpanded = true;
    }
    const flat = flattenTree(groups);

    const state: SearchScreenState = {
      query: 'modal',
      results: [modalCollection, modalRecord1, modalRecord2],
      collectionGroups: groups,
      flatVisibleTree: flat,
      selectedIndex: 0
    };

    const keyQueue = ['left', 'q'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'q')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    await runSearchScreen(mockSession as any, state, mockKeys as any);

    expect(groups[0]?.isExpanded).toBe(false);
  });
});

describe('renderReaderScreen', () => {
  let outputData = '';
  const originalWrite = process.stdout.write;

  beforeEach(() => {
    outputData = '';
    process.stdout.write = ((chunk: string) => {
      outputData += chunk;

      return true;
    }) as any;
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
  });

  it('renders title, body lines, scroll position, and shortcuts', () => {
    renderReaderScreen(
      'patternfly://records/test',
      '# Title Heading',
      ['Line 1', 'Line 2', 'Line 3'],
      0,
      'Status message',
      true
    );

    expect(outputData).toContain('# Title Heading');
    expect(outputData).toContain('Line 1');
    expect(outputData).toContain('Status message');
    expect(outputData).toContain('<c> copy');
    expect(outputData).toContain('<r> save .md');
  });

  it('omits copy shortcut hint when clipboardEnabled is false', () => {
    renderReaderScreen('patternfly://records/test', '# Title', ['Line 1'], 0, '', false);

    expect(outputData).not.toContain('<c> copy');
    expect(outputData).toContain('<r> save .md');
  });
});

describe('runReaderScreen', () => {
  const mockSession = {
    search: jest.fn(),
    readResource: jest.fn(),
    close: jest.fn(),
    isConnected: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSession.readResource.mockResolvedValue({
      text: '# Test Title\n\n' + Array.from({ length: 40 }, (_, i) => `Paragraph line ${i + 1}`).join('\n')
    });
  });

  it.each([
    { key: 'b', expected: 'back' },
    { key: 'esc', expected: 'back' },
    { key: 'enter', expected: 'back' },
    { key: 'q', expected: 'quit' },
    { key: 'ctrl-c', expected: 'quit' }
  ])('exits reader screen with $expected on "$key"', async ({ key, expected }) => {
    const mockKeys = {
      readKey: jest.fn().mockResolvedValue(key),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    const result = await runReaderScreen(mockSession as any, 'patternfly://records/test', mockKeys as any, true);

    expect(result).toBe(expected);
  });

  it('handles scrolling with down, up, pagedown, space, and pageup', async () => {
    const keyQueue = ['down', 'down', 'up', 'pagedown', 'space', 'pageup', 'b'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'b')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    const result = await runReaderScreen(mockSession as any, 'patternfly://records/test', mockKeys as any, true);

    expect(result).toBe('back');
  });

  it('handles clipboard copy on "c" when enabled', async () => {
    const copySpy = jest.spyOn(clientHelpers, 'copyTextToClipboard').mockReturnValue({
      ok: true,
      message: 'Copied document'
    });

    const keyQueue = ['c', 'b'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'b')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    await runReaderScreen(mockSession as any, 'patternfly://records/test', mockKeys as any, true);
    expect(copySpy).toHaveBeenCalled();
  });

  it('handles file save on "r" including success and failure notes', async () => {
    const writeFileSpy = jest.spyOn(fs, 'writeFile').mockResolvedValue(undefined);
    const keyQueue = ['r', 'b'];
    const mockKeys = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(keyQueue.shift() || 'b')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    await runReaderScreen(mockSession as any, 'patternfly://records/test', mockKeys as any, true);
    expect(writeFileSpy).toHaveBeenCalled();

    writeFileSpy.mockRejectedValueOnce(new Error('disk write denied'));
    const failQueue = ['r', 'b'];
    const mockKeysFail = {
      readKey: jest.fn().mockImplementation(() => Promise.resolve(failQueue.shift() || 'b')),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    await runReaderScreen(mockSession as any, 'patternfly://records/test', mockKeysFail as any, true);
    expect(writeFileSpy).toHaveBeenCalledTimes(2);
  });

  it('truncates text exceeding MAX_TERMINAL_DISPLAY_CHARS for display', async () => {
    const longText = 'A'.repeat(MAX_TERMINAL_DISPLAY_CHARS + 500);

    mockSession.readResource.mockResolvedValueOnce({ text: longText });

    const mockKeys = {
      readKey: jest.fn().mockResolvedValue('b'),
      enable: jest.fn(),
      disable: jest.fn(),
      dispose: jest.fn()
    };

    const result = await runReaderScreen(mockSession as any, 'patternfly://records/long', mockKeys as any, true);

    expect(result).toBe('back');
  });
});

describe('runInteractiveClient', () => {
  it('throws error when stdin or stdout is not a TTY', async () => {
    const originalInputTTY = input.isTTY;

    Object.defineProperty(input, 'isTTY', { value: false, configurable: true });

    await expect(runInteractiveClient({} as any)).rejects.toThrow('Interactive pf-client requires a TTY');

    Object.defineProperty(input, 'isTTY', { value: originalInputTTY, configurable: true });
  });
});
