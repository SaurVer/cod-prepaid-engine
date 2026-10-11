import type { Config } from 'tailwindcss';

// Razorpay visual language (sampled from razorpay.com): Inter, navy text, primary blue, soft blue tints.
export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#192839', soft: '#40566D', faint: '#768EA7' },
        line: '#DFE3E9',
        canvas: '#F8FAFC',
        panel: '#F1F5FA',
        rzp: { DEFAULT: '#305EFF', hover: '#2950DA', soft: '#E9F0FF', faint: '#F4F7FF', navy: '#0F1E3A' },
        ok: { DEFAULT: '#00875A', soft: '#E3F5EC' },
        bad: { DEFAULT: '#D92D3F', soft: '#FDECEE' },
        warn: { DEFAULT: '#A15C00', soft: '#FFF3DE' },
        dew: { DEFAULT: '#F4A38C', deep: '#E07E63' },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: { '2xs': ['11px', '15px'] },
      boxShadow: {
        card: '0 1px 2px rgba(25, 40, 57, 0.04), 0 1px 1px rgba(25, 40, 57, 0.03)',
        pop: '0 12px 32px rgba(25, 40, 57, 0.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;
