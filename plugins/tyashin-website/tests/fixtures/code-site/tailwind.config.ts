import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--brand-primary)',
        'primary-contrast': 'var(--brand-primary-contrast)',
        accent: 'var(--brand-accent)',
        ink: 'var(--brand-ink)',
        background: 'var(--brand-bg)',
        surface: 'var(--brand-surface)',
        foreground: 'var(--brand-text)',
        muted: 'var(--brand-text-muted)',
        border: 'var(--brand-border)',
      },
      borderRadius: {
        sm: 'var(--brand-radius-sm)',
        md: 'var(--brand-radius-md)',
        lg: 'var(--brand-radius-lg)',
        full: 'var(--brand-radius-full)',
      },
      fontFamily: {
        heading: ['var(--brand-heading-font)'],
        body: ['var(--brand-body-font)'],
      },
    },
  },
} satisfies Config;
