// Stylesheet rules for the UI kit (ADR 0009): every color, size, font, shadow and motion value
// comes from a design token variable, so a token change reaches every component. Shorthands are
// expanded per longhand; rgb() or calc() count as raw values. A raw var() fallback is not caught.

/** The properties whose values must be token variables or a neutral keyword. */
const TOKEN_PROPERTIES = [
  '/color$/',
  '/^background/',
  '/^border/',
  '/^outline/',
  'fill',
  'stroke',
  '/^font/',
  'line-height',
  'letter-spacing',
  '/^margin/',
  '/^padding/',
  '/gap$/',
  'box-shadow',
  'transition-duration',
  'transition-timing-function',
  'transition-delay',
  'animation-duration',
  'animation-timing-function',
  'animation-delay',
  '/^(?:min-|max-)?(?:width|height)$/',
  '/^(?:inset|top|right|bottom|left)$/',
];

/** Values that carry no design decision, including the keywords of non-visual longhands. */
const NEUTRAL_KEYWORDS = [
  '0',
  'none',
  'auto',
  'inherit',
  'initial',
  'unset',
  'currentColor',
  'transparent',
  'solid',
  'dashed',
  '100%',
  'normal',
  'italic',
  'no-repeat',
  'collapse',
  'separate',
  // The notch and the home indicator: a fact of the device, not a design value.
  '/^env\\(safe-area-inset-(?:top|right|bottom|left)\\)$/',
];

export default {
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      TOKEN_PROPERTIES,
      { ignoreValues: NEUTRAL_KEYWORDS, ignoreFunctions: false, expandShorthand: true },
    ],
  },
};
