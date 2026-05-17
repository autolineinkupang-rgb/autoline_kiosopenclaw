/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx}', './components/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        kios: { primary: '#16a34a', danger: '#dc2626', warning: '#d97706' },
      },
    },
  },
  plugins: [],
};
