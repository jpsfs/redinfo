/**
 * Design Tokens — Cruz Vermelha Portuguesa, Delegação de Campo
 *
 * Single source of truth for brand colors, typography scale, spacing scale,
 * and component color tokens. Import from here instead of hard-coding values.
 *
 * Palette reference: Official Red Cross brand (ICRC / CVP).
 *   Red   PMS 485 C  →  #ED1B24
 *   Dark  PMS 485 C (dark shade)  →  #B01218
 *   White →  #FFFFFF
 *   Neutral greys: #F5F5F5 / #E0E0E0 / #9E9E9E / #616161 / #212121
 */

// ─── Brand colors ────────────────────────────────────────────────────────────
export const colorRedCrossRed = '#ED1B24';
export const colorRedCrossRedDark = '#B01218';
export const colorRedCrossRedLight = '#F8878B';

export const colorWhite = '#FFFFFF';
export const colorBlack = '#000000';

// Neutral greys (light → dark)
export const colorGrey50 = '#FAFAFA';
export const colorGrey100 = '#F5F5F5';
export const colorGrey200 = '#E0E0E0';
export const colorGrey400 = '#BDBDBD';
export const colorGrey500 = '#9E9E9E';
export const colorGrey700 = '#616161';
export const colorGrey900 = '#212121';

// Text
export const colorTextPrimary = colorGrey900;
export const colorTextSecondary = colorGrey700;
export const colorTextDisabled = colorGrey500;

// Surface / Background
export const colorSurface = colorWhite;
export const colorBackground = colorGrey100;

// Semantic
export const colorError = '#D32F2F';
export const colorWarning = '#F57C00';
export const colorSuccess = '#388E3C';
export const colorInfo = '#1976D2';

// ─── Typography scale ─────────────────────────────────────────────────────────
export const fontFamilyBase =
  '"Inter", "Roboto", "Helvetica Neue", "Arial", sans-serif';

/** Base rem → px mapping at root 16px */
export const fontSizeBase = '1rem'; // 16px — WCAG / mobile minimum
export const fontSizeSmall = '0.875rem'; // 14px
export const fontSizeXSmall = '0.75rem'; // 12px — captions only

/** Heading scale (rem) */
export const fontSizeH1 = '2.25rem'; // 36px
export const fontSizeH2 = '1.875rem'; // 30px
export const fontSizeH3 = '1.5rem'; // 24px
export const fontSizeH4 = '1.25rem'; // 20px
export const fontSizeH5 = '1.125rem'; // 18px
export const fontSizeH6 = '1rem'; // 16px

export const fontWeightRegular = 400;
export const fontWeightMedium = 500;
export const fontWeightSemiBold = 600;
export const fontWeightBold = 700;

export const lineHeightBase = 1.5;
export const lineHeightTight = 1.25;

// ─── Spacing scale ────────────────────────────────────────────────────────────
/** Base spacing unit in px — MUI default is 8px. */
export const spacingUnit = 8;

// ─── Component tokens ─────────────────────────────────────────────────────────
/** Minimum touch target size per WCAG 2.5.5 / mobile UX guidelines. */
export const touchTargetSize = 44; // px

/** Corner radii */
export const borderRadiusSmall = 4; // px
export const borderRadiusMedium = 8; // px
export const borderRadiusLarge = 12; // px

/** Elevation / shadow policy: flat UI — keep shadows subtle. */
export const elevationCard = 1;
export const elevationAppBar = 2;

// ─── Logo assets ──────────────────────────────────────────────────────────────
/** Primary local path for the full Delegação de Campo logotype (/public). */
export const logoDelegacaoCampoUrl = '/logo-delegacao-campo.jpg';

/** Remote URL fallback for the full Delegação de Campo logotype (HTTPS). */
export const logoDelegacaoCampoRemoteUrl =
  'https://www.cvpcampo.org/imagens/cvp.jpg';
/** Local path for the compact Red Cross emblem (SVG in /public). */
export const logoRedCrossEmblemPath = '/logo-red-cross.svg';

/** Width in px applied when falling back to the local Red Cross emblem. */
export const logoFallbackSize = 80;
