/**
 * Index keyword filtering for high-volume matches.
 *
 * @note It's tempting to remove category and section names from this list, don't. Instead, the search
 * should be leveraging filters which allow for "section" and "category" specifically.
 */
const INDEX_BLOCKLIST_WORDS = ['patternfly', 'component', 'components', 'documentation', 'example', 'examples'];

/**
 * Technical terms and acronyms that should be exempt from length and noise filtering.
 *
 * @note If "AI" starts producing noisy or overly broad matches in search, remove it from this
 * list and consider adding it to the noise words or blocklist.
 */
const INDEX_EXCEPTION_WORDS = ['cli', 'css', 'ai', 'rtl', 'ltr'];

/**
 * Noise words that are common and do not add significant value to search results.
 */
const INDEX_NOISE_WORDS = [
  'about',
  'actually',
  'allows',
  'almost',
  'also',
  'although',
  'always',
  'and',
  'another',
  'appropriate',
  'available',
  'based',
  'because',
  'been',
  'before',
  'being',
  'between',
  'certain',
  'could',
  'does',
  'during',
  'either',
  'enough',
  'ever',
  'find',
  'first',
  'give',
  'goes',
  'gone',
  'have',
  'however',
  'just',
  'keep',
  'many',
  'maybe',
  'more',
  'most',
  'must',
  'neither',
  'never',
  'next',
  'nothing',
  'often',
  'other',
  'otherwise',
  'perhaps',
  'please',
  'possible',
  'provide',
  'rather',
  'really',
  'said',
  'same',
  'says',
  'seem',
  'self',
  'several',
  'should',
  'show',
  'since',
  'some',
  'still',
  'such',
  'sure',
  'take',
  'the',
  'than',
  'that',
  'their',
  'them',
  'then',
  'there',
  'they',
  'thing',
  'this',
  'those',
  'though',
  'thus',
  'together',
  'towards',
  'under',
  'until',
  'upon',
  'used',
  'using',
  'various',
  'very',
  'well',
  'were',
  'what',
  'when',
  'where',
  'whether',
  'which',
  'while',
  'whose',
  'will',
  'with',
  'would',
  'you'
];

export { INDEX_BLOCKLIST_WORDS, INDEX_EXCEPTION_WORDS, INDEX_NOISE_WORDS };
