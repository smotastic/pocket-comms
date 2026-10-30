// Generated from src/*.tokens.json by style-dictionary.mjs. Do not edit.

/** The CSS custom property of every semantic token, as a `var(--…)` reference. */
export const tokens = {
  color: {
    bg: {
      canvas: 'var(--color-bg-canvas)',
      surface: 'var(--color-bg-surface)',
      accent: 'var(--color-bg-accent)',
      'accent-hover': 'var(--color-bg-accent-hover)',
      'accent-soft': 'var(--color-bg-accent-soft)',
      'danger-soft': 'var(--color-bg-danger-soft)',
      sheet: 'var(--color-bg-sheet)',
      scrim: 'var(--color-bg-scrim)',
    },
    text: {
      default: 'var(--color-text-default)',
      muted: 'var(--color-text-muted)',
      accent: 'var(--color-text-accent)',
      'on-accent': 'var(--color-text-on-accent)',
      danger: 'var(--color-text-danger)',
    },
    border: {
      default: 'var(--color-border-default)',
      focus: 'var(--color-border-focus)',
      control: 'var(--color-border-control)',
    },
  },
  space: {
    '3xs': 'var(--space-3xs)',
    '2xs': 'var(--space-2xs)',
    xs: 'var(--space-xs)',
    sm: 'var(--space-sm)',
    md: 'var(--space-md)',
    lg: 'var(--space-lg)',
    xl: 'var(--space-xl)',
    '2xl': 'var(--space-2xl)',
    '3xl': 'var(--space-3xl)',
  },
  radius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    full: 'var(--radius-full)',
  },
  border: {
    width: {
      default: 'var(--border-width-default)',
      focus: 'var(--border-width-focus)',
    },
  },
  control: {
    height: {
      md: 'var(--control-height-md)',
    },
  },
  layout: {
    width: {
      page: 'var(--layout-width-page)',
    },
    height: {
      'sheet-gap': 'var(--layout-height-sheet-gap)',
    },
  },
  font: {
    family: {
      body: 'var(--font-family-body)',
    },
    size: {
      xs: 'var(--font-size-xs)',
      sm: 'var(--font-size-sm)',
      md: 'var(--font-size-md)',
      base: 'var(--font-size-base)',
      lead: 'var(--font-size-lead)',
      lg: 'var(--font-size-lg)',
      xl: 'var(--font-size-xl)',
    },
    weight: {
      regular: 'var(--font-weight-regular)',
      medium: 'var(--font-weight-medium)',
      bold: 'var(--font-weight-bold)',
    },
    lineHeight: {
      body: 'var(--font-line-height-body)',
      tight: 'var(--font-line-height-tight)',
      display: 'var(--font-line-height-display)',
    },
    letterSpacing: {
      tight: 'var(--font-letter-spacing-tight)',
    },
  },
  motion: {
    duration: {
      fast: 'var(--motion-duration-fast)',
      medium: 'var(--motion-duration-medium)',
      pulse: 'var(--motion-duration-pulse)',
    },
    easing: {
      standard: 'var(--motion-easing-standard)',
      decelerate: 'var(--motion-easing-decelerate)',
    },
  },
  shadow: {
    card: 'var(--shadow-card)',
  },
} as const;
