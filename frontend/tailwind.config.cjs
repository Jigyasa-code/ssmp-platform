/**
 * Tailwind theme for SSMP.
 * Palette is the Academic Nexus system from design-reference/, retuned to
 * match the MUJ SLCM portal: terracotta sidebar, white top bar, light grey
 * work surface.
 */
module.exports = {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // ── SLCM shell ────────────────────────────────────────────────
        sidebar: {
          DEFAULT: '#bf4a1f',
          hover: '#ab3f19',
          active: '#a43700',
          border: '#a83c14',
          text: '#ffffff',
          muted: '#f6d5c8'
        },
        topbar: {
          DEFAULT: '#ffffff',
          border: '#e2e2e2'
        },
        // ── Academic Nexus core ───────────────────────────────────────
        primary: '#a43700',
        'primary-container': '#cd4800',
        'on-primary': '#ffffff',
        'on-primary-container': '#fffbff',
        'primary-fixed': '#ffdbcf',
        'primary-fixed-dim': '#ffb59a',
        'on-primary-fixed': '#380d00',
        'on-primary-fixed-variant': '#802a00',
        secondary: '#a93700',
        'secondary-container': '#fd7039',
        'on-secondary': '#ffffff',
        'on-secondary-container': '#601c00',
        tertiary: '#5b5c5c',
        'tertiary-container': '#747575',
        'on-tertiary': '#ffffff',
        error: '#ba1a1a',
        'error-container': '#ffdad6',
        'on-error': '#ffffff',
        'on-error-container': '#93000a',
        success: '#1b7340',
        'success-container': '#d4f0df',
        'on-success-container': '#0d4526',
        warning: '#b47a00',
        'warning-container': '#ffeecb',
        'on-warning-container': '#5c3d00',
        info: '#1b5e8f',
        'info-container': '#d6e9f8',
        'on-info-container': '#0d3352',
        background: '#f0f1f2',
        surface: '#f9f9f9',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f3f3f4',
        'surface-container': '#eeeeee',
        'surface-container-high': '#e8e8e8',
        'surface-container-highest': '#e2e2e2',
        'surface-variant': '#e2e2e2',
        'on-surface': '#1a1c1c',
        'on-surface-variant': '#574239',
        'inverse-surface': '#2f3131',
        'inverse-on-surface': '#f0f1f1',
        outline: '#8b7268',
        'outline-variant': '#dfc0b5'
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem'
      },
      spacing: {
        base: '4px',
        xs: '8px',
        sm: '16px',
        md: '24px',
        lg: '32px',
        xl: '48px',
        gutter: '20px',
        sidebar: '260px'
      },
      fontFamily: {
        headline: ['Manrope', 'system-ui', 'sans-serif'],
        body: ['"Hanken Grotesk"', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'display-lg': ['48px', { lineHeight: '56px', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-lg': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-sm': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px' }],
        'body-md': ['16px', { lineHeight: '24px' }],
        'body-sm': ['14px', { lineHeight: '20px' }],
        'label-md': ['14px', { lineHeight: '20px', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '16px', fontWeight: '500' }]
      },
      boxShadow: {
        card: '0 1px 2px rgba(26, 28, 28, 0.06)',
        raised: '0 4px 12px rgba(0, 0, 0, 0.08)',
        dropdown: '0 8px 24px rgba(26, 28, 28, 0.14)'
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.96) translateY(6px)' },
          to: { opacity: '1', transform: 'scale(1) translateY(0)' }
        },
        'slide-in-right': {
          from: { opacity: '0', transform: 'translateX(16px)' },
          to: { opacity: '1', transform: 'translateX(0)' }
        },
        shimmer: { from: { backgroundPosition: '200% 0' }, to: { backgroundPosition: '-200% 0' } }
      },
      animation: {
        'fade-in': 'fade-in 0.22s ease-out both',
        'scale-in': 'scale-in 0.18s ease-out both',
        'slide-in-right': 'slide-in-right 0.22s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite'
      }
    }
  },
  plugins: [require('@tailwindcss/forms')]
};
