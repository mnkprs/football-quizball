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
    // StepOver tier classes for dynamic leaderboard rows
    'so-tier-legend','so-tier-elite','so-tier-challenger','so-tier-contender','so-tier-grassroots',
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
          dim: 'var(--color-accent-dim)',
        },
        surface: {
          lowest:  'var(--color-surface-lowest)',
          low:     'var(--color-surface-low)',
          DEFAULT: 'var(--color-surface)',
          high:    'var(--color-surface-high)',
          highest: 'var(--color-surface-highest)',
          bright:  'var(--color-surface-bright)',
        },
        destructive: 'var(--color-destructive)',
        win:  'var(--color-win)',
        loss: 'var(--color-loss)',
        draw: 'var(--color-draw)',
        ring: 'var(--color-ring)',
        warning: 'var(--color-warning)',
        pro: 'var(--color-pro)',
        tier: {
          legend:     'var(--tier-legend)',
          elite:      'var(--tier-elite)',
          challenger: 'var(--tier-challenger)',
          contender:  'var(--tier-contender)',
          grassroots: 'var(--tier-grassroots)',
        },
      },
      fontFamily: {
        sans:     ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        headline: ['Space Grotesk', 'sans-serif'],
        display:  ['Space Grotesk', 'sans-serif'],
        numeric:  ['Lexend', 'sans-serif'],
        mono:     ['JetBrains Mono', 'monospace'],
        brand:    ['Alfa Slab One', 'serif'],
      },
      borderRadius: {
        sm: '4px', md: '8px', lg: '12px', xl: '24px',
      },
      boxShadow: {
        'accent-glow':     '0 0 15px rgba(0, 122, 255, 0.30)',
        'accent-floodlit': '0 0 60px -15px rgba(0, 122, 255, 0.30)',
        'ghost':           'inset 0 0 0 1px rgba(42, 53, 68, 0.15)',
      },
      backdropBlur: {
        glass: '20px',
      },
      animation: {
        'wrong-shake':  'wrong-shake-tight 400ms cubic-bezier(0.25, 1, 0.5, 1)',
        'pulse-accent': 'so-pulse-accent 1.8s ease-in-out infinite',
      },
      keyframes: {
        'wrong-shake-tight': {
          '0%,100%': { transform: 'translateX(0)' },
          '20%':     { transform: 'translateX(-4px)' },
          '40%':     { transform: 'translateX(4px)' },
          '60%':     { transform: 'translateX(-3px)' },
          '80%':     { transform: 'translateX(2px)' },
        },
      },
    },
  },
  plugins: [],
};
