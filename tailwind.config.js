/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class', // Enable dark mode with class strategy
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        arabic: ['Tajawal','Cairo','Tahoma','Arial','sans-serif'],
      },
      colors: {
        primary: { DEFAULT: '#DC2626' },
        accent: { DEFAULT: '#22D3EE' },
        dark: { DEFAULT: '#0B1020' },
        page: { DEFAULT: '#f7f2e6' },
      },
      boxShadow: {
        soft: '0 10px 25px rgba(0,0,0,0.25)',
      },
      screens: {
        'xs': '475px',
        '3xl': '1920px',
        '4xl': '2560px',
        '5xl': '3840px',
      },
      spacing: {
        '128': '32rem',
        '144': '36rem',
      }
    }
  },
  corePlugins: { preflight: true },
  plugins: [],
}
