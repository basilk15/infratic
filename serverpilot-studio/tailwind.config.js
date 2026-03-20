/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0f1117',
          secondary: '#161b27',
          tertiary: '#1e2535',
          elevated: '#252d3d'
        },
        accent: {
          blue: '#4f8ef7',
          green: '#3ecf8e',
          yellow: '#f5a623',
          red: '#e5534b',
          purple: '#9b72f7'
        },
        text: {
          primary: '#e8eaf0',
          secondary: '#8892a4',
          muted: '#4a5568'
        }
      },
      animation: {
        'pulse-fast': 'pulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }
    }
  },
  plugins: []
};
