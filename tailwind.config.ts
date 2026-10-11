import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F3F8F5',
          100: '#E4F0E9',
          200: '#C6DFD0',
          300: '#97C4A9',
          500: '#3E8A63',
          600: '#2F6B4F',
          700: '#245540',
          800: '#1B4031',
          900: '#12291F',
        },
        // Razorpay's single blue accent, used only on primary system actions
        rzp: { DEFAULT: '#2B6CF6', hover: '#1F57D6', soft: '#EAF1FE' },
        ink: { DEFAULT: '#1B2420', soft: '#4A5650', faint: '#7C8782' },
        line: '#E3E8E5',
        canvas: '#F7F9F8',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      fontSize: { '2xs': ['11px', '14px'] },
    },
  },
  plugins: [],
} satisfies Config;
