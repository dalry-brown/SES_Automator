import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ce: {
          navy:      '#182f54',
          navy2:     '#243d6a',
          navy3:     '#0f1e38',
          amber:     '#ec9b3f',
          amber2:    '#f5b96a',
          amberpale: '#fdf6ec',
          ambertext: '#92400e',
          bg:        '#f4f6f9',
          border:    '#dde2ea',
          border2:   '#c3cad6',
          text:      '#1c2b3a',
          muted:     '#6b7a8d',
          hint:      '#9aa5b1',
        },
        // keep legacy brand colours for pages not yet migrated
        brand: {
          navy:     '#0f2c4e',
          blue:     '#1a4480',
          sky:      '#2563eb',
          skyLight: '#3b82f6',
          gold:     '#c9a227',
          goldLight:'#f0c040',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', "'Segoe UI'", 'system-ui', 'sans-serif'],
      },
      borderWidth: { '05': '0.5px' },
      keyframes: {
        modalIn: {
          from: { opacity: '0', transform: 'scale(0.96) translateY(8px)' },
          to:   { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'modal-in': 'modalIn 0.2s ease',
        'fade-in':  'fadeIn 0.15s ease-out',
      },
    },
  },
  plugins: [],
};

export default config;
