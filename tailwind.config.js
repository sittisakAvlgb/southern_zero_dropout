/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // future dark-mode support; default is light
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — Modern Government x AI Command Center
        brand: {
          50: '#eef4ff',
          100: '#dae6ff',
          200: '#bcd2ff',
          300: '#8eb5ff',
          400: '#598cff',
          500: '#2f66f6', // primary blue
          600: '#1a4fe0',
          700: '#163fc0',
          800: '#17379b',
          900: '#0f2a6b', // navy
          950: '#0a1c47',
        },
        navy: '#0f2a6b',
        // Risk semantic scale
        risk: {
          normal: '#16a34a', // green
          watch: '#eab308', // yellow
          high: '#f97316', // orange
          critical: '#dc2626', // red
        },
        surface: {
          DEFAULT: '#ffffff',
          muted: '#f6f8fc',
          border: '#e6ebf3',
        },
        ink: {
          DEFAULT: '#0f1b2d',
          muted: '#5b6b82',
          faint: '#94a3b8',
        },
      },
      fontFamily: {
        // Font is switched at runtime via the `lang-th` / `lang-en` body class
        th: ['Kanit', 'sans-serif'],
        en: ['Ubuntu', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 42, 107, 0.04), 0 6px 20px rgba(16, 42, 107, 0.06)',
        'card-hover': '0 8px 30px rgba(16, 42, 107, 0.12)',
        panel: '-8px 0 40px rgba(16, 42, 107, 0.12)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(220, 38, 38, 0.5)' },
          '70%': { boxShadow: '0 0 0 12px rgba(220, 38, 38, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(220, 38, 38, 0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        // Route-entrance: TRANSFORM ONLY — never touches opacity, so the page
        // content is always fully visible even if the animation is interrupted
        // or restarted by fast menu switching. Prevents "blank until refresh".
        'page-rise': {
          '0%': { transform: 'translateY(10px)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fade-up 0.4s ease-out both',
        'page-rise': 'page-rise 0.28s ease-out',
      },
    },
  },
  plugins: [],
}
