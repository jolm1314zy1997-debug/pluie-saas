/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        cream: {
          50: '#FEFDFB',
          100: '#FDF9F0',
          200: '#F8F0E0',
          300: '#F0E4CC',
          400: '#E5D3B3',
          500: '#D4BC94',
          600: '#C2A676',
          700: '#A88B5C',
          800: '#8A7248',
          900: '#6E5A3A',
        },
        brand: {
          50: '#F5F0EB',
          100: '#EBE0D6',
          200: '#D7C1AD',
          300: '#C3A084',
          400: '#AF7F5B',
          500: '#9B6E3E',
          600: '#876034',
          700: '#6D4C2A',
          800: '#533B20',
          900: '#392916',
        },
        charcoal: {
          50: '#F7F7F7',
          100: '#E3E3E3',
          200: '#C8C8C8',
          300: '#A4A4A4',
          400: '#818181',
          500: '#666666',
          600: '#515151',
          700: '#434343',
          800: '#383838',
          900: '#1A1A1A',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Playfair Display', 'Georgia', 'serif'],
      },
      backgroundImage: {
        'cream-gradient': 'linear-gradient(135deg, #FEFDFB 0%, #F8F0E0 50%, #F0E4CC 100%)',
        'warm-gradient': 'linear-gradient(135deg, #FDF9F0 0%, #F8F0E0 100%)',
      },
      boxShadow: {
        'elegant': '0 2px 20px 0 rgba(0, 0, 0, 0.04), 0 1px 4px 0 rgba(0, 0, 0, 0.02)',
        'elegant-md': '0 4px 24px 0 rgba(0, 0, 0, 0.06), 0 2px 8px 0 rgba(0, 0, 0, 0.03)',
        'elegant-lg': '0 8px 40px 0 rgba(0, 0, 0, 0.08), 0 4px 12px 0 rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
};
