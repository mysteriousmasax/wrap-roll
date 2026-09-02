/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#ae002a', container: '#d4213d', fixed: '#ffdad9', 'on': '#ffffff' },
        secondary: { DEFAULT: '#775a00', container: '#ffc72c', fixed: '#ffdf99', 'on': '#ffffff' },
        surface: { DEFAULT: '#fcf9f8', dim: '#dcd9d9', bright: '#fcf9f8', variant: '#e5e2e1', 'container-lowest': '#ffffff', 'container-low': '#f6f3f2', container: '#f0eded', 'container-high': '#eae7e7', 'container-highest': '#e5e2e1', 'on': '#1c1b1b', 'on-variant': '#5b4040', tint: '#be0630' },
        error: { DEFAULT: '#ba1a1a', container: '#ffdad6', 'on': '#ffffff' },
        success: '#28A745',
        warning: '#FD7E14',
        outline: { DEFAULT: '#906f6f', variant: '#e4bdbd' },
      },
      fontFamily: {
        display: ['Montserrat', 'sans-serif'],
        body: ['Montserrat', 'sans-serif'],
        info: ['Hanken Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: { 'ambient': '0px 10px 30px rgba(0,0,0,0.04)', 'elevated': '0px 8px 24px rgba(0,0,0,0.12)' },
      animation: { 'scan': 'scan 2s ease-in-out infinite', 'slide-up': 'slideUp 0.3s ease-out', 'fade-in': 'fadeIn 0.2s ease-out', 'bounce-in': 'bounceIn 0.5s ease-out' },
      keyframes: {
        scan: { '0%, 100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(200px)' } },
        slideUp: { '0%': { transform: 'translateY(20px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        bounceIn: { '0%': { transform: 'scale(0.3)', opacity: '0' }, '50%': { transform: 'scale(1.05)' }, '100%': { transform: 'scale(1)', opacity: '1' } },
      },
    },
  },
  plugins: [],
};