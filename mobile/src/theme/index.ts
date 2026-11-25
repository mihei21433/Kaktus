/** Цвета и размеры по снимкам «Кактуса» (тёмная тема). */
export const colors = {
  bg: '#0B0F14',
  card: '#18202A',
  cardAlt: '#1F2833',
  input: '#111820',
  border: '#2A3441',
  borderStrong: '#3A4654',
  text: '#F2F5F8',
  textSecondary: '#9AA6B2',
  textMuted: '#6B7785',
  green: '#4FC879',
  greenDim: '#1F3A2A',
  greenText: '#0B0F14',
  blue: '#3B9CFF',
  orange: '#F0A63A',
  orangeDim: '#3A2C14',
  red: '#F0646C',
  redDim: '#3A1A1E',
  purple: '#A97BFF',
  purpleDim: '#2A2140',
  overlay: 'rgba(0,0,0,0.6)',
} as const;

export const goalPalette = ['#4FC879', '#F0A63A', '#3B9CFF', '#A97BFF', '#9AA6B2', '#F0646C'] as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 16 } as const;

export const font = {
  h1: { fontSize: 26, fontWeight: '800' as const, color: colors.text },
  h2: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  title: { fontSize: 16, fontWeight: '600' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text },
  small: { fontSize: 13, color: colors.textSecondary },
  caption: {
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.6,
    textTransform: 'uppercase' as const,
    color: colors.textSecondary,
  },
};
