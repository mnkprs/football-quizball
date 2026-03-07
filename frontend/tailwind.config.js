/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  safelist: [
    'from-amber-800', 'to-amber-600', 'bg-amber-900', 'border-amber-700',
    'from-purple-700', 'to-purple-500', 'bg-purple-900', 'border-purple-700',
    'from-blue-700',   'to-blue-500',   'bg-blue-900',   'border-blue-700',
    'from-red-700',    'to-red-500',    'bg-red-900',    'border-red-700',
    'from-teal-700',   'to-teal-500',   'bg-teal-900',   'border-teal-700',
  ],
  theme: { extend: {} },
  plugins: [],
};
