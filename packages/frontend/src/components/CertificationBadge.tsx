import { Chip, ChipProps, Tooltip } from '@mui/material';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {
  CERTIFICATION_LABEL,
  CertificationStatus,
  CertificationType,
  certificationStatus,
} from '@redinfo/shared';
import { formatDate, toIsoDate } from '../utils/dates';

/**
 * The one place a certification's type → label and status → colour mapping
 * lives, in the spirit of `CategoryChip`. Status colours only
 * (`success`/`warning`/`error`) — never a category colour, which is reserved
 * for `EventReportType`/`AvailabilityWindowCategory` everywhere else in the app.
 */
const STATUS_COLOR: Record<CertificationStatus, 'success' | 'warning' | 'error'> = {
  VALID: 'success',
  EXPIRING: 'warning',
  EXPIRED: 'error',
};

/** e.g. "TAS · válido até 14 mar 2029" / "TAS · sem data de validade registada". */
function statusText(type: CertificationType, validUntil: string | null, status: CertificationStatus): string {
  const label = CERTIFICATION_LABEL[type];
  if (!validUntil) return `${label} — no expiry on file`;
  const date = formatDate(validUntil);
  if (status === 'EXPIRED') return `${label} — expired ${date}`;
  return `${label} — valid until ${date}`;
}

export interface CertificationBadgeProps extends Omit<ChipProps, 'color' | 'label'> {
  type: CertificationType;
  /** ISO date, `YYYY-MM-DD`, or `null` for "no known expiry" — counts as valid. */
  validUntil: string | null;
  /** Defaults to today; pass explicitly only in a test. */
  today?: string;
  /** Set when this is a granted certification, not one actually held. */
  grantedBy?: CertificationType;
}

/**
 * One certification's badge: type, and whether it is current, expiring within
 * six months, or expired — computed the same way everywhere via
 * `certificationStatus` (shared).
 *
 * `validUntil: null` is its own state ("no expiry on file"), rendered as a
 * dashed border rather than a plain green tick — the isDriver migration
 * writes exactly this, and it must never read as a confirmed date.
 */
export const CertificationBadge = ({
  type,
  validUntil,
  today = toIsoDate(new Date()),
  grantedBy,
  size = 'small',
  ...rest
}: CertificationBadgeProps) => {
  const status = certificationStatus(validUntil, today);
  const color = STATUS_COLOR[status];
  const noExpiryOnFile = validUntil === null;
  const label = grantedBy
    ? `${CERTIFICATION_LABEL[type]} · via ${CERTIFICATION_LABEL[grantedBy]}`
    : CERTIFICATION_LABEL[type];

  return (
    <Tooltip title={statusText(type, validUntil, status)}>
      <Chip
        size={size}
        variant="outlined"
        color={color}
        icon={
          type === CertificationType.DRIVER ? (
            <DirectionsCarIcon fontSize="small" />
          ) : noExpiryOnFile ? (
            <HelpOutlineIcon fontSize="small" />
          ) : undefined
        }
        label={label}
        sx={[
          grantedBy ? { borderStyle: 'dashed' } : {},
          ...(Array.isArray(rest.sx) ? rest.sx : rest.sx ? [rest.sx] : []),
        ]}
        {...rest}
      />
    </Tooltip>
  );
};
