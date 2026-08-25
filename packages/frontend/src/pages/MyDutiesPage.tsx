import { useCallback, useEffect, useState } from 'react';
import { Title } from 'react-admin';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import BadgeIcon from '@mui/icons-material/Badge';
import DirectionsCarIcon from '@mui/icons-material/DirectionsCar';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { MyDutiesResponse, MyDuty } from '@redinfo/shared';
import { apiFetch } from '../api';
import { useT } from '../i18n/useT';
import { WindowCategoryChip } from '../resources/availability/WindowIdentity';
import { formatDayLabel, parseIsoDate } from '../utils/dates';

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** The date block down the left of a duty card: weekday, day, month + year. */
const DutyDate = ({ date }: { date: string }) => {
  const parsed = parseIsoDate(date);
  const weekday = formatDayLabel(date).split(',')[0];
  return (
    <Box
      sx={{
        width: 96,
        flex: 'none',
        pr: 2.5,
        borderRight: '1px solid',
        borderColor: 'divider',
      }}
    >
      <Typography
        variant="caption"
        sx={{ fontWeight: 600, color: 'text.secondary', textTransform: 'uppercase' }}
      >
        {weekday}
      </Typography>
      <Typography variant="h2" sx={{ fontSize: '1.875rem', fontWeight: 700, lineHeight: 1.25 }}>
        {parsed.getUTCDate()}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {MONTH_ABBREVIATIONS[parsed.getUTCMonth()]} {parsed.getUTCFullYear()}
      </Typography>
    </Box>
  );
};

const DutyCard = ({ duty }: { duty: MyDuty }) => {
  const t = useT();
  return (
    <Paper variant="outlined" sx={{ display: 'flex', alignItems: 'center', gap: 2.5, p: 2 }}>
      <DutyDate date={duty.date} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <AccessTimeIcon fontSize="small" sx={{ color: 'text.secondary' }} />
          <Typography variant="h5" sx={{ fontWeight: 600 }}>
            {duty.label}
          </Typography>
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mt: 0.75 }}>
          {duty.roleName && (
            <Chip
              size="small"
              variant="outlined"
              color="warning"
              icon={<BadgeIcon fontSize="small" />}
              label={duty.roleName}
            />
          )}
          <WindowCategoryChip category={duty.windowCategory} />
          <Typography variant="body2" color="text.secondary">
            {duty.windowLabel}
          </Typography>
        </Stack>
      </Box>
      {duty.vehiclesNeeded > 0 && (
        <Chip
          size="small"
          variant="outlined"
          icon={<DirectionsCarIcon fontSize="small" />}
          label={t(
            duty.vehiclesNeeded === 1 ? 'myDuties.vehicleCountOne' : 'myDuties.vehicleCountMany',
            { count: duty.vehiclesNeeded },
          )}
        />
      )}
    </Paper>
  );
};

/**
 * Someone's own duties, across every rota they are on.
 *
 * Deliberately its own page rather than a panel on "My availability": duties
 * span windows — an Emergency month and a weekend event may both be live — and
 * a page bound to one window's picker could not show both. Only published
 * schedules appear; a draft is a coordinator's working copy, not a promise.
 */
export const MyDutiesPage = () => {
  const t = useT();
  const [duties, setDuties] = useState<MyDutiesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setDuties(await apiFetch<MyDutiesResponse>('/schedules/me'));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('myDuties.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card sx={{ mt: 2 }}>
      <Title title={t('myDuties.pageTitle')} />
      <CardContent>
        <Typography variant="h6">{t('myDuties.heading')}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('myDuties.subheading')}
        </Typography>

        {loading && <CircularProgress size={24} />}

        {error && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {duties && (
          <>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="subtitle2">{t('myDuties.upcoming')}</Typography>
              <Chip size="small" variant="outlined" label={duties.upcoming.length} />
            </Stack>

            {duties.upcoming.length === 0 ? (
              <Typography variant="body2" color="text.secondary">
                {t('myDuties.noneScheduled')}
              </Typography>
            ) : (
              <Stack spacing={1.5}>
                {duties.upcoming.map((duty) => (
                  <DutyCard key={duty.id} duty={duty} />
                ))}
              </Stack>
            )}

            {duties.past.length > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Button
                  fullWidth
                  variant="outlined"
                  color="secondary"
                  onClick={() => setShowPast((value) => !value)}
                  endIcon={showPast ? <ExpandLessIcon /> : <ExpandMoreIcon />}
                  sx={{ justifyContent: 'space-between' }}
                >
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography variant="subtitle2">{t('myDuties.pastDuties')}</Typography>
                    <Chip size="small" variant="outlined" label={duties.past.length} />
                  </Stack>
                </Button>
                <Collapse in={showPast} unmountOnExit>
                  <Stack spacing={1.5} sx={{ mt: 1.5 }}>
                    {duties.past.map((duty) => (
                      <DutyCard key={duty.id} duty={duty} />
                    ))}
                  </Stack>
                </Collapse>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
