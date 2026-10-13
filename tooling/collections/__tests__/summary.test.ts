import { jest } from '@jest/globals';
import { printDiffSummary } from '../summary';

describe('printDiffSummary', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should print no-change message when diff buckets are empty', () => {
    printDiffSummary(
      { added: [], removed: [], modified: [] },
      {
        title: 'Empty Diff',
        formatAdded: item => String(item),
        formatRemoved: item => String(item),
        formatModified: item => String(item)
      }
    );

    expect(logSpy).toHaveBeenCalledWith('\n📊 Empty Diff:');
    expect(logSpy).toHaveBeenCalledWith('   ✨ No record additions, removals, or property modifications detected.');
  });

  it('should print categorized changes with custom formatters', () => {
    printDiffSummary(
      {
        added: [{ name: 'A1' }],
        removed: [{ name: 'R1' }],
        modified: [{ name: 'M1', reason: 'score' }]
      },
      {
        title: 'Custom Changes',
        formatAdded: item => `Item: ${item.name}`,
        formatRemoved: item => `Item: ${item.name}`,
        formatModified: item => `Item: ${item.name} (${item.reason})`
      }
    );

    expect(logSpy).toHaveBeenCalledWith('\n📊 Custom Changes:');
    expect(logSpy).toHaveBeenCalledWith('   ➕ Added (1):');
    expect(logSpy).toHaveBeenCalledWith('      + Item: A1');
    expect(logSpy).toHaveBeenCalledWith('   ➖ Removed (1):');
    expect(logSpy).toHaveBeenCalledWith('      - Item: R1');
    expect(logSpy).toHaveBeenCalledWith('   🔄 Modified (1):');
    expect(logSpy).toHaveBeenCalledWith('      ~ Item: M1 (score)');
  });

  it.each([
    {
      description: 'default limits (10 added, 15 removed, 10 modified)',
      diff: {
        added: Array.from({ length: 12 }, (_, i) => `add-${i + 1}`),
        removed: Array.from({ length: 18 }, (_, i) => `rem-${i + 1}`),
        modified: Array.from({ length: 11 }, (_, i) => `mod-${i + 1}`)
      },
      options: {
        title: 'Truncated Diff',
        formatAdded: (item: string) => item,
        formatRemoved: (item: string) => item,
        formatModified: (item: string) => item
      },
      expectedLogs: [
        '   ➕ Added (12):',
        '      + add-10',
        '      ... and 2 more',
        '   ➖ Removed (18):',
        '      - rem-15',
        '      ... and 3 more',
        '   🔄 Modified (11):',
        '      ~ mod-10',
        '      ... and 1 more'
      ]
    },
    {
      description: 'custom limits (1 added, 1 removed, 2 modified)',
      diff: {
        added: ['a1', 'a2', 'a3'],
        removed: ['r1', 'r2'],
        modified: ['m1', 'm2', 'm3', 'm4']
      },
      options: {
        title: 'Custom Limited Diff',
        formatAdded: (item: string) => item,
        formatRemoved: (item: string) => item,
        formatModified: (item: string) => item,
        limits: { added: 1, removed: 1, modified: 2 }
      },
      expectedLogs: [
        '   ➕ Added (3):',
        '      + a1',
        '      ... and 2 more',
        '   ➖ Removed (2):',
        '      - r1',
        '      ... and 1 more',
        '   🔄 Modified (4):',
        '      ~ m1',
        '      ~ m2',
        '      ... and 2 more'
      ]
    }
  ])('should truncate diff output properly, $description', ({ diff, options, expectedLogs }) => {
    printDiffSummary(diff, options);

    for (const log of expectedLogs) {
      expect(logSpy).toHaveBeenCalledWith(log);
    }
  });
});
