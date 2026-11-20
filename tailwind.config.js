/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Microsoft YaHei"', '"PingFang SC"', 'sans-serif'],
      },
      keyframes: {
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        'pulse-gold': {
          '0%, 100%': { boxShadow: '0 0 15px rgba(251, 191, 36, 0.6)' },
          '50%': { boxShadow: '0 0 30px rgba(251, 191, 36, 1)' },
        },
        'shake': {
          '0%, 100%': { transform: 'translate(0, 0) rotate(0deg)' },
          '20%': { transform: 'translate(-8px, 6px) rotate(-1.5deg)' },
          '40%': { transform: 'translate(8px, -6px) rotate(1.5deg)' },
          '60%': { transform: 'translate(-6px, -4px) rotate(-1deg)' },
          '80%': { transform: 'translate(6px, 4px) rotate(1deg)' },
        }
      },
      animation: {
        'float': 'float 3s ease-in-out infinite',
        'pulse-gold': 'pulse-gold 2s infinite',
        'shake': 'shake 0.45s ease-in-out infinite',
      }
    },
  },
  plugins: [],
}
