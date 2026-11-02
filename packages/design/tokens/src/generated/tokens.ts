// Generated from src/*.tokens.json by style-dictionary.mjs. Do not edit.

/** The CSS custom property of every semantic token, as a `var(--…)` reference. */
export const tokens = {
  color: {
    terminal: {
      bg: 'var(--color-terminal-bg)',
      fg: 'var(--color-terminal-fg)',
      ansi: {
        black: 'var(--color-terminal-ansi-black)',
        red: 'var(--color-terminal-ansi-red)',
        green: 'var(--color-terminal-ansi-green)',
        yellow: 'var(--color-terminal-ansi-yellow)',
        blue: 'var(--color-terminal-ansi-blue)',
        magenta: 'var(--color-terminal-ansi-magenta)',
        cyan: 'var(--color-terminal-ansi-cyan)',
        white: 'var(--color-terminal-ansi-white)',
        'bright-black': 'var(--color-terminal-ansi-bright-black)',
        'bright-red': 'var(--color-terminal-ansi-bright-red)',
        'bright-green': 'var(--color-terminal-ansi-bright-green)',
        'bright-yellow': 'var(--color-terminal-ansi-bright-yellow)',
        'bright-blue': 'var(--color-terminal-ansi-bright-blue)',
        'bright-magenta': 'var(--color-terminal-ansi-bright-magenta)',
        'bright-cyan': 'var(--color-terminal-ansi-bright-cyan)',
        'bright-white': 'var(--color-terminal-ansi-bright-white)',
      },
    },
    bg: {
      canvas: 'var(--color-bg-canvas)',
      surface: 'var(--color-bg-surface)',
      accent: 'var(--color-bg-accent)',
      'accent-hover': 'var(--color-bg-accent-hover)',
      'accent-soft': 'var(--color-bg-accent-soft)',
      'danger-soft': 'var(--color-bg-danger-soft)',
      sheet: 'var(--color-bg-sheet)',
      scrim: 'var(--color-bg-scrim)',
      'success-soft': 'var(--color-bg-success-soft)',
      'neutral-soft': 'var(--color-bg-neutral-soft)',
      bar: 'var(--color-bg-bar)',
    },
    text: {
      default: 'var(--color-text-default)',
      muted: 'var(--color-text-muted)',
      accent: 'var(--color-text-accent)',
      'on-accent': 'var(--color-text-on-accent)',
      danger: 'var(--color-text-danger)',
      success: 'var(--color-text-success)',
    },
    border: {
      default: 'var(--color-border-default)',
      focus: 'var(--color-border-focus)',
      control: 'var(--color-border-control)',
      danger: 'var(--color-border-danger)',
      success: 'var(--color-border-success)',
    },
    project: {
      '1': 'var(--color-project-1)',
      '2': 'var(--color-project-2)',
      '3': 'var(--color-project-3)',
      '4': 'var(--color-project-4)',
      '5': 'var(--color-project-5)',
      neutral: 'var(--color-project-neutral)',
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
      stripe: 'var(--border-width-stripe)',
    },
  },
  control: {
    height: {
      sm: 'var(--control-height-sm)',
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
      mono: 'var(--font-family-mono)',
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
      label: 'var(--font-letter-spacing-label)',
    },
  },
  motion: {
    duration: {
      fast: 'var(--motion-duration-fast)',
      medium: 'var(--motion-duration-medium)',
      pulse: 'var(--motion-duration-pulse)',
      hold: 'var(--motion-duration-hold)',
    },
    easing: {
      standard: 'var(--motion-easing-standard)',
      decelerate: 'var(--motion-easing-decelerate)',
      linear: 'var(--motion-easing-linear)',
    },
  },
  shadow: {
    card: 'var(--shadow-card)',
  },
} as const;
