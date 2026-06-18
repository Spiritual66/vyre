/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        wa: {
          green: 'var(--accent)',
          'green-dark': 'var(--accent-dark)',
          'green-light': 'var(--accent-light)',
          teal: '#075e54',
          'teal-dark': '#054c44',
        },
      },
      fontFamily: {
        sans: ['Segoe UI', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
