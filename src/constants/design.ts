// Central design tokens — imported by all screens
export const Colors = {
  // Brand
  navy:        '#00152B',
  navyDark:    '#000D1A',
  navyMid:     '#001F3F',
  navyLight:   '#002D5A',
  blue:        '#0084FF',
  blueLight:   '#3BA3FF',
  blueDim:     '#004E99',

  // Surfaces
  surface:     '#FFFFFF',
  surfaceAlt:  '#F4F8FF',
  card:        '#FFFFFF',
  border:      '#DCE8F8',

  // Text
  textPrimary:   '#00152B',
  textSecondary: '#4A6A8A',
  textMuted:     '#8AAAC5',
  textWhite:     '#FFFFFF',

  // State
  success:    '#10B981',
  successBg:  '#D1FAE5',
  danger:     '#EF4444',
  dangerBg:   '#FEE2E2',
  warning:    '#F59E0B',
  warningBg:  '#FEF3C7',
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
};

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const Shadow = {
  sm: {
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  md: {
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: '#0084FF',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
};
