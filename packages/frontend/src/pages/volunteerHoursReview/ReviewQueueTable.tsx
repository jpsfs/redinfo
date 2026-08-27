import { useState, MouseEvent } from 'react';
import {
  Button,
  Checkbox,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { formatMinutes, VolunteerHoursEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { activityTypeLabel } from '../../i18n/labels';
import { formatDayLabel } from '../../utils/dates';
import { CategoryChip } from '../../components/CategoryChip';
import { ReviewEntryFlags } from './ReviewEntryFlags';

const ROTA_CATEGORIES = new Set(['EMERGENCY', 'LOCAL_SUPPORT', 'SALOP_SUPPORT']);

function daysAgo(date: string): number {
  const today = new Date().toISOString().slice(0, 10);
  const ms = Date.parse(`${today}T00:00:00.000Z`) - Date.parse(`${date}T00:00:00.000Z`);
  return Math.max(0, Math.round(ms / 86_400_000));
}

export interface ReviewQueueTableProps {
  entries: VolunteerHoursEntry[];
  selected: Set<string>;
  savingIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onApprove: (entry: VolunteerHoursEntry) => void;
  onAdjust: (entry: VolunteerHoursEntry) => void;
  onDismiss: (entry: VolunteerHoursEntry) => void;
}

const RowMenu = ({
  entry,
  onAdjust,
  onDismiss,
}: {
  entry: VolunteerHoursEntry;
  onAdjust: (entry: VolunteerHoursEntry) => void;
  onDismiss: (entry: VolunteerHoursEntry) => void;
}) => {
  const t = useT();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return (
    <>
      <IconButton size="small" aria-label={t('volunteerHoursReview.moreActions')} onClick={(e: MouseEvent<HTMLElement>) => setAnchor(e.currentTarget)}>
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onAdjust(entry);
          }}
        >
          {t('volunteerHoursReview.adjustButton')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onDismiss(entry);
          }}
        >
          {t('volunteerHoursReview.dismissButton')}
        </MenuItem>
      </Menu>
    </>
  );
};

/** Desktop table for the review queue — swapped for `ReviewQueueCards` below `sm`. */
export const ReviewQueueTable = ({
  entries,
  selected,
  savingIds,
  onToggle,
  onToggleAll,
  onApprove,
  onAdjust,
  onDismiss,
}: ReviewQueueTableProps) => {
  const t = useT();
  const allSelected = entries.length > 0 && entries.every((e) => selected.has(e.id));
  const someSelected = entries.some((e) => selected.has(e.id));

  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell padding="checkbox">
            <Checkbox
              checked={allSelected}
              indeterminate={someSelected && !allSelected}
              onChange={onToggleAll}
            />
          </TableCell>
          <TableCell>{t('volunteerHoursReview.colVolunteer')}</TableCell>
          <TableCell>{t('volunteerHoursReview.colActivity')}</TableCell>
          <TableCell>{t('volunteerHoursReview.colDate')}</TableCell>
          <TableCell>{t('volunteerHoursReview.adjustProposed')}</TableCell>
          <TableCell>{t('volunteerHoursReview.colFlags')}</TableCell>
          <TableCell />
        </TableRow>
      </TableHead>
      <TableBody>
        {entries.map((entry) => {
          const saving = savingIds.has(entry.id);
          const changed = entry.proposedMinutes !== (entry.baselineMinutes ?? entry.proposedMinutes);
          const age = daysAgo(entry.date);
          return (
            <TableRow key={entry.id} selected={selected.has(entry.id)} sx={{ opacity: saving ? 0.6 : 1 }}>
              <TableCell padding="checkbox">
                <Checkbox checked={selected.has(entry.id)} onChange={() => onToggle(entry.id)} disabled={saving} />
              </TableCell>
              <TableCell>
                {entry.user ? `${entry.user.firstName} ${entry.user.lastName}` : entry.userId}
              </TableCell>
              <TableCell>
                <Stack direction="row" spacing={1} alignItems="center">
                  {ROTA_CATEGORIES.has(entry.activityType) ? (
                    <CategoryChip
                      size="small"
                      category={entry.activityType}
                      label={activityTypeLabel(t, entry.activityType)}
                    />
                  ) : (
                    <Chip size="small" variant="outlined" label={activityTypeLabel(t, entry.activityType)} />
                  )}
                  {entry.source === 'MANUAL' && (
                    <Chip size="small" variant="outlined" label={t('myHours.manualBadge')} />
                  )}
                </Stack>
              </TableCell>
              <TableCell>
                <Typography variant="body2">{formatDayLabel(t, entry.date)}</Typography>
                {age > 7 && (
                  <Typography variant="caption" color="text.secondary">
                    {t('volunteerHoursReview.ago', { days: age })}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatMinutes(entry.proposedMinutes)}
                </Typography>
                {changed && entry.baselineMinutes !== null && entry.baselineMinutes !== undefined && (
                  <Typography variant="caption" color="info.main">
                    {formatMinutes(entry.proposedMinutes - entry.baselineMinutes)} · {formatMinutes(entry.baselineMinutes)}
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                <ReviewEntryFlags entry={entry} />
              </TableCell>
              <TableCell align="right">
                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                  <Button size="small" variant="outlined" disabled={saving} onClick={() => onApprove(entry)}>
                    {t('volunteerHoursReview.approveButton')}
                  </Button>
                  <RowMenu entry={entry} onAdjust={onAdjust} onDismiss={onDismiss} />
                </Stack>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
