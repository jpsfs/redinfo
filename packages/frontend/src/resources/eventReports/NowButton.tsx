import { Button } from '@mui/material';

export interface NowButtonProps {
  onClick: () => void;
  label: string;
  /**
   * `inline` is the pill beside a time field on the report form. `stamp` is the
   * full-width 64px control a crew hits with a glove on, in a moving ambulance,
   * without looking — the live run's bottom bar.
   *
   * One component rather than two because it is the same act: writing "now" into
   * a field. Only the target's size differs, and the size is what the caller
   * knows.
   */
  size?: 'inline' | 'stamp';
  disabled?: boolean;
}

/** A "stamp the time now" button. Big, because it is pressed with a glove on. */
export const NowButton = ({
  onClick,
  label,
  size = 'inline',
  disabled = false,
}: NowButtonProps) => (
  <Button
    size={size === 'inline' ? 'small' : 'large'}
    fullWidth={size === 'stamp'}
    variant={size === 'stamp' ? 'contained' : 'text'}
    disabled={disabled}
    onClick={onClick}
    sx={
      size === 'inline'
        ? {
            minHeight: 40,
            borderRadius: 20,
            px: 1.75,
            flexShrink: 0,
            fontWeight: 700,
            bgcolor: 'rgba(237, 27, 36, 0.08)',
          }
        : {
            minHeight: 64,
            borderRadius: 2,
            fontWeight: 800,
            fontSize: '1.0625rem',
            letterSpacing: '0.02em',
          }
    }
  >
    {label}
  </Button>
);
