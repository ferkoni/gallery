// Components colour themselves with the tokens in index.css, so a theme change reaches them.
// A literal neutral (bg-white, text-gray-500…) would bypass the tokens.
const sources = import.meta.glob<string>(['/src/**/*.tsx', '!/src/tests/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

// Drawn over a black overlay whatever the theme.
const ALWAYS_DARK = [
  '/src/features/images/components/Lightbox.tsx',
  '/src/features/images/components/UndoToast.tsx',
];

const LITERAL =
  /(?<![\w-])(?:[a-z-]+:)*(?:(?:bg|text|border|divide|ring)-(?:white|gray-\d+)|text-(?:red|blue|green)-\d+|ring-[a-z]+-\d+)(?:\/\d+)?(?![\w-])/g;

describe('colour tokens', () => {
  it('finds the components', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it.each(Object.keys(sources).filter((path) => !ALWAYS_DARK.includes(path)))(
    '%s uses tokens, not literal neutrals',
    (path) => {
      const literals = (sources[path].match(LITERAL) ?? []).filter((c) => !c.endsWith('text-white'));
      expect(literals).toEqual([]);
    },
  );
});
