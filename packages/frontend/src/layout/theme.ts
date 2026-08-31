import { createTheme, ThemeOptions } from '@mui/material/styles';
import { defaultTheme } from 'react-admin';
import {
  colorRedCrossRed,
  colorRedCrossRedDark,
  colorRedCrossRedLight,
  colorWhite,
  colorGrey50,
  colorGrey100,
  colorGrey200,
  colorGrey700,
  colorGrey900,
  colorError,
  colorWarning,
  colorSuccess,
  colorInfo,
  colorTextPrimary,
  colorTextSecondary,
  colorTextDisabled,
  fontFamilyBase,
  fontSizeBase,
  fontSizeSmall,
  fontSizeXSmall,
  fontSizeH1,
  fontSizeH2,
  fontSizeH3,
  fontSizeH4,
  fontSizeH5,
  fontSizeH6,
  fontWeightRegular,
  fontWeightMedium,
  fontWeightSemiBold,
  fontWeightBold,
  lineHeightBase,
  lineHeightTight,
  touchTargetSize,
  borderRadiusSmall,
  borderRadiusMedium,
  spacingUnit,
} from './design-tokens';

export const theme = createTheme({
  ...defaultTheme,

  // ─── Spacing ───────────────────────────────────────────────────────────────
  spacing: spacingUnit,

  // ─── Shape ────────────────────────────────────────────────────────────────
  shape: {
    borderRadius: borderRadiusSmall,
  },

  // ─── Palette ──────────────────────────────────────────────────────────────
  palette: {
    primary: {
      main: colorRedCrossRed,
      dark: colorRedCrossRedDark,
      light: colorRedCrossRedLight,
      contrastText: colorWhite,
    },
    secondary: {
      main: colorGrey700,
      dark: colorGrey900,
      light: colorGrey200,
      contrastText: colorWhite,
    },
    error: { main: colorError },
    warning: { main: colorWarning },
    success: { main: colorSuccess },
    info: { main: colorInfo },
    background: {
      default: colorGrey100,
      paper: colorWhite,
    },
    text: {
      primary: colorTextPrimary,
      secondary: colorTextSecondary,
      disabled: colorTextDisabled,
    },
    divider: colorGrey200,
  },

  // ─── Typography ───────────────────────────────────────────────────────────
  typography: {
    fontFamily: fontFamilyBase,
    fontSize: 16, // root px — base rem anchor
    fontWeightRegular,
    fontWeightMedium,
    fontWeightBold,
    h1: { fontSize: fontSizeH1, fontWeight: fontWeightBold, lineHeight: lineHeightTight },
    h2: { fontSize: fontSizeH2, fontWeight: fontWeightBold, lineHeight: lineHeightTight },
    h3: { fontSize: fontSizeH3, fontWeight: fontWeightSemiBold, lineHeight: lineHeightTight },
    h4: { fontSize: fontSizeH4, fontWeight: fontWeightSemiBold, lineHeight: lineHeightTight },
    h5: { fontSize: fontSizeH5, fontWeight: fontWeightSemiBold, lineHeight: lineHeightBase },
    h6: { fontSize: fontSizeH6, fontWeight: fontWeightSemiBold, lineHeight: lineHeightBase },
    body1: { fontSize: fontSizeBase, lineHeight: lineHeightBase },
    body2: { fontSize: fontSizeSmall, lineHeight: lineHeightBase },
    caption: { fontSize: fontSizeXSmall, lineHeight: lineHeightBase },
    button: { fontWeight: fontWeightMedium, textTransform: 'none' as const },
  },

  // ─── Component overrides ──────────────────────────────────────────────────
  components: {
    // Include react-admin's default component overrides first, then apply ours
    ...(defaultTheme.components as ThemeOptions['components']),

    // ── App bar: Red Cross red ──────────────────────────────────────────────
    MuiAppBar: {
      defaultProps: { elevation: 2 },
      styleOverrides: {
        root: {
          backgroundColor: colorRedCrossRed,
          color: colorWhite,
          backgroundImage: 'none', // enforce flat — no gradient
        },
      },
    },

    // ── Buttons: touch-friendly (min 44px), primary red, secondary outlined ─
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: touchTargetSize,
          borderRadius: borderRadiusMedium,
          fontWeight: fontWeightMedium,
        },
        containedPrimary: {
          backgroundColor: colorRedCrossRed,
          '&:hover': { backgroundColor: colorRedCrossRedDark },
        },
        outlinedPrimary: {
          borderColor: colorRedCrossRed,
          color: colorRedCrossRed,
          '&:hover': {
            borderColor: colorRedCrossRedDark,
            backgroundColor: 'rgba(237, 27, 36, 0.04)',
          },
        },
        outlinedSecondary: {
          borderColor: colorGrey200,
          color: colorTextPrimary,
          '&:hover': { borderColor: colorGrey700 },
        },
      },
    },

    // ── Icon button: touch target ──────────────────────────────────────────
    MuiIconButton: {
      styleOverrides: {
        root: { minWidth: touchTargetSize, minHeight: touchTargetSize },
      },
    },

    // ── Text field: touch-friendly inputs ─────────────────────────────────
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: borderRadiusSmall,
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
            borderColor: colorRedCrossRed,
            borderWidth: 2,
          },
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          '&.Mui-focused': { color: colorRedCrossRed },
        },
      },
    },
    MuiInputBase: {
      styleOverrides: {
        root: { minHeight: touchTargetSize },
      },
    },

    // ── Cards: flat, white surface ─────────────────────────────────────────
    MuiCard: {
      defaultProps: { elevation: 1 },
      styleOverrides: {
        root: { borderRadius: borderRadiusMedium },
      },
    },

    // ── Paper ──────────────────────────────────────────────────────────────
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' }, // no gradient overlays
      },
    },

    // ── Chip: accessible contrast ──────────────────────────────────────────
    MuiChip: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: colorRedCrossRed,
          color: colorWhite,
        },
      },
    },

    // ── Focus visible: accessible ring ────────────────────────────────────
    MuiButtonBase: {
      styleOverrides: {
        root: {
          '&.Mui-focusVisible': {
            outline: `3px solid ${colorRedCrossRed}`,
            outlineOffset: 2,
          },
        },
      },
    },

    // ── react-admin Login page overrides ──────────────────────────────────
    //
    // Was a solid `colorRedCrossRed` field behind the card — too strong at
    // full-viewport scale even though the same red is fine as an accent
    // (button, chip, card edge). A soft neutral base with a faint red glow
    // keeps the brand identity (plus the card's red top edge and the red
    // submit button) without the wall-of-red.
    RaLogin: {
      styleOverrides: {
        root: {
          backgroundColor: colorGrey100,
          backgroundImage: `radial-gradient(ellipse 900px 480px at 50% -12%, ${colorRedCrossRedLight}40, transparent 70%), linear-gradient(180deg, ${colorGrey50} 0%, ${colorGrey100} 100%)`,
          // `100vh` on a mobile browser is taller than the visible area once
          // the address bar is accounted for, so a fully-fitting page still
          // scrolled and, being centered, revealed empty space above the
          // card rather than cutting anything off. `100dvh` tracks the
          // actual visible viewport instead.
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: spacingUnit * 2,
          // react-admin's overridesResolver only applies `root` — hide the
          // default lock-icon avatar using a nested selector instead of the
          // `avatar` slot key, which is not processed by overridesResolver.
          '& .RaLogin-avatar': { display: 'none' },
        },
        card: {
          borderRadius: borderRadiusMedium,
          borderTop: `4px solid ${colorRedCrossRed}`,
          padding: `${spacingUnit}px`,
          boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
          width: '100%',
          maxWidth: 400,
        },
      },
    },

    // ── react-admin LoginForm: make content fill the card width ────────────
    // overridesResolver only exposes `root`, so use a nested selector (same
    // technique as the avatar fix above) to override the hardcoded width:300.
    RaLoginForm: {
      styleOverrides: {
        root: {
          '& .RaLoginForm-content': {
            width: '100%',
            boxSizing: 'border-box',
          },
        },
      },
    },
  },
});
