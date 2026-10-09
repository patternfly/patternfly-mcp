/**
 * Generic container for categorized diff items.
 */
interface DiffSummaryBuckets<TAdded, TRemoved, TModified> {
  added: TAdded[];
  removed: TRemoved[];
  modified: TModified[];
}

/**
 * Truncation thresholds for console diff output.
 */
interface DiffSummaryLimits {
  added?: number;
  removed?: number;
  modified?: number;
}

/**
 * Formatters and configuration for diff summary output.
 */
interface DiffSummaryFormatters<TAdded, TRemoved, TModified> {
  title: string;
  formatAdded: (item: TAdded) => string;
  formatRemoved: (item: TRemoved) => string;
  formatModified: (item: TModified) => string;
  limits?: DiffSummaryLimits;
}

/**
 * Print a truncated, categorized summary of additions, removals, and modifications to the console.
 *
 * @param diff - Categorized diff items
 * @param options - Formatters and configuration object
 * @param options.title - Title for the summary report
 * @param options.formatAdded - Formatter function for added items
 * @param options.formatRemoved - Formatter function for removed items
 * @param options.formatModified - Formatter function for modified items
 * @param [options.limits] - Truncation limits
 */
const printDiffSummary = <TAdded, TRemoved, TModified>(
  diff: DiffSummaryBuckets<TAdded, TRemoved, TModified>,
  {
    title,
    formatAdded,
    formatRemoved,
    formatModified,
    limits = {}
  }: DiffSummaryFormatters<TAdded, TRemoved, TModified>
): void => {
  const { added, removed, modified } = diff;
  const hasChanges = added.length > 0 || removed.length > 0 || modified.length > 0;
  const maxAdded = limits.added ?? 10;
  const maxRemoved = limits.removed ?? 15;
  const maxModified = limits.modified ?? 10;

  console.log(`\n📊 ${title}:`);

  if (!hasChanges) {
    console.log('   ✨ No record additions, removals, or property modifications detected.');

    return;
  }

  if (added.length > 0) {
    console.log(`   ➕ Added (${added.length}):`);
    added.slice(0, maxAdded).forEach(item => {
      console.log(`      + ${formatAdded(item)}`);
    });
    if (added.length > maxAdded) {
      console.log(`      ... and ${added.length - maxAdded} more`);
    }
  }

  if (removed.length > 0) {
    console.log(`   ➖ Removed (${removed.length}):`);
    removed.slice(0, maxRemoved).forEach(item => {
      console.log(`      - ${formatRemoved(item)}`);
    });
    if (removed.length > maxRemoved) {
      console.log(`      ... and ${removed.length - maxRemoved} more`);
    }
  }

  if (modified.length > 0) {
    console.log(`   🔄 Modified (${modified.length}):`);
    modified.slice(0, maxModified).forEach(item => {
      console.log(`      ~ ${formatModified(item)}`);
    });
    if (modified.length > maxModified) {
      console.log(`      ... and ${modified.length - maxModified} more`);
    }
  }
};

export {
  printDiffSummary,
  type DiffSummaryBuckets,
  type DiffSummaryFormatters,
  type DiffSummaryLimits
};
