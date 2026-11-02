/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // future dark-mode support; default is light
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand — สถาบันราชการ: กรมท่าสุขุม (sober institutional navy)
        brand: {
          50: '#eef2f8',
          100: '#d7e1ee',
          200: '#b1c5de',
          300: '#86a3c5',
          400: '#547da9',
          500: '#305a8a', // primary
          600: '#22456f', // buttons / strong
          700: '#1a3659',
          800: '#152b47',
          900: '#0e1f35', // navy masthead
          950: '#091422',
        },
        navy: '#0e1f35',
        // Gold/brass — แต้มทางการอย่างสำรวม: เส้นบนหัว ขอบโลโก้ เส้นใต้แท็บที่เลือก
        // ใช้บนพื้นน้ำเงินเป็นหลัก — gold-600 ~4.5:1 บนพื้นขาว (คู่กับตัวหนาเท่านั้น)
        gold: {
          50: '#faf5e8',
          100: '#f1e4c2',
          200: '#e5cd91',
          300: '#d7b25f',
          400: '#c9a24a', // ring / เส้นใต้แท็บ บนพื้นน้ำเงิน
          500: '#c08a2d', // เส้นบนหัว (brass)
          600: '#9a6c18',
          700: '#78520f',
          800: '#5a3d0b',
        },
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
        // ตัวหนังสือรองเข้มขึ้นให้คมและอ่านง่ายสำหรับครูที่อายุมาก
        // muted ~7:1 · faint ~4.8:1 บนพื้นขาว (เดิม faint 2.6:1 ต่ำกว่าเกณฑ์ WCAG AA)
        ink: {
          DEFAULT: '#0f1b2d',
          muted: '#46566c',
          faint: '#64748b',
        },
      },
      fontFamily: {
        // Font is switched at runtime via the `lang-th` / `lang-en` body class
        th: ['Noto Sans Thai Looped', 'sans-serif'],
        en: ['Ubuntu', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(14, 31, 53, 0.04), 0 6px 20px rgba(14, 31, 53, 0.06)',
        'card-hover': '0 8px 30px rgba(14, 31, 53, 0.12)',
        panel: '-8px 0 40px rgba(14, 31, 53, 0.12)',
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
