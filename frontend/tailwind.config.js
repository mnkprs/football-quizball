/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/**/*.{html,ts}'],
  safelist: [
    // Board category gradients (dynamic class binding)
    'from-amber-800', 'to-amber-600', 'bg-amber-900', 'border-amber-700',
    'from-purple-700', 'to-purple-500', 'bg-purple-900', 'border-purple-700',
    'from-blue-700',   'to-blue-500',   'bg-blue-900',   'border-blue-700',
    'from-red-700',    'to-red-500',    'bg-red-900',    'border-red-700',
    'from-teal-700',   'to-teal-500',   'bg-teal-900',   'border-teal-700',
    'from-green-700',  'to-green-500',  'bg-green-900',  'border-green-700',
    'from-pink-700',   'to-pink-500',   'bg-pink-900',   'border-pink-700',
    'from-indigo-700', 'to-indigo-500', 'bg-indigo-900', 'border-indigo-700',
    // Solo & Blitz dynamic classes (choiceClass, difficultyBadgeClass, result banners)
    'bg-win/10', 'bg-win/20', 'bg-win/95', 'border-win', 'border-win/50', 'text-win',
    'bg-loss/10', 'bg-loss/20', 'bg-loss/95', 'border-loss', 'text-loss',
    'bg-yellow-900/50', 'text-yellow-400', 'border-yellow-700',
    'text-white/80',
    'animate-wrong-shake',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--color-background)',
        foreground: 'var(--color-foreground)',
        card: {
          DEFAULT: 'var(--color-card)',
          foreground: 'var(--color-card-foreground)',
        },
        border: 'var(--color-border)',
        muted: {
          DEFAULT: 'var(--color-muted)',
          foreground: 'var(--color-muted-foreground)',
        },
        accent: {
          DEFAULT: 'var(--color-accent)',
          foreground: 'var(--color-accent-foreground)',
          light: 'var(--color-accent-light)',
        },
        destructive: 'var(--color-destructive)',
        win: 'var(--color-win)',
        loss: 'var(--color-loss)',
        draw: 'var(--color-draw)',
        ring: 'var(--color-ring)',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'wrong-shake': 'wrong-shake-tight 400ms cubic-bezier(0.25, 1, 0.5, 1)',
      },
    },
  },
  plugins: [],
};
