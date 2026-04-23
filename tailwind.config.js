/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './{pages,components,hooks}/**/*.{ts,tsx}',
    './*.tsx',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}

