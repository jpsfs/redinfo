import { useMemo, useState } from 'react';
import {
  Avatar,
  Box,
  List,
  ListItem,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { PeopleStatisticsRosterEntry } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useIntlLocale } from '../../i18n/useIntlLocale';
import { parseIsoDate } from '../../utils/dates';
import { colorChartSingleSeries } from '../../layout/design-tokens';

export type RosterSort = 'hours' | 'name' | 'events';

export interface RosterProps {
  roster: PeopleStatisticsRosterEntry[];
  viewerId: string;
}

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function sortRoster(roster: PeopleStatisticsRosterEntry[], sort: RosterSort): PeopleStatisticsRosterEntry[] {
  const byName = (a: PeopleStatisticsRosterEntry, b: PeopleStatisticsRosterEntry) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`);
  const sorted = [...roster];
  if (sort === 'name') sorted.sort(byName);
  else if (sort === 'events') sorted.sort((a, b) => b.events - a.events || byName(a, b));
  else sorted.sort((a, b) => b.hours - a.hours || byName(a, b));
  return sorted;
}

/**
 * Every volunteer with hours or an event in range — presented as a roster,
 * not a podium (docs/plans/estatisticas-dashboards.md §2): default order is
 * by hours, but sortable to name or events for a reader who'd rather not read
 * it as a ranking. The viewer's own row is always highlighted, wherever it lands.
 */
export const Roster = ({ roster, viewerId }: RosterProps) => {
  const t = useT();
  const isMobile = useIsMobile();
  const locale = useIntlLocale();
  const [sort, setSort] = useState<RosterSort>('hours');
  const sorted = useMemo(() => sortRoster(roster, sort), [roster, sort]);
  const maxHours = Math.max(1, ...roster.map((r) => r.hours));

  if (roster.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        {t('statistics.people.rosterEmpty')}
      </Typography>
    );
  }

  const formatDate = (date: string | null) =>
    date ? parseIsoDate(date).toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : '—';

  const sortControl = (
    <TextField
      select
      size="small"
      value={sort}
      onChange={(e) => setSort(e.target.value as RosterSort)}
      sx={{ minWidth: 160 }}
    >
      <MenuItem value="hours">{t('statistics.people.rosterColumnHours')}</MenuItem>
      <MenuItem value="name">{t('statistics.people.rosterSortName')}</MenuItem>
      <MenuItem value="events">{t('statistics.people.rosterColumnEvents')}</MenuItem>
    </TextField>
  );

  if (isMobile) {
    return (
      <Box>
        <Box sx={{ mb: 1 }}>{sortControl}</Box>
        <List disablePadding>
          {sorted.map((row) => {
            const isViewer = row.userId === viewerId;
            return (
              <ListItem
                key={row.userId}
                disableGutters
                sx={{
                  bgcolor: isViewer ? 'action.selected' : 'transparent',
                  borderRadius: 1,
                  px: 1,
                  mb: 0.5,
                }}
              >
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ width: '100%' }}>
                  <Avatar sx={{ width: 32, height: 32, fontSize: 13 }}>
                    {initials(row.firstName, row.lastName)}
                  </Avatar>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {row.firstName} {row.lastName}
                      {isViewer && ` (${t('statistics.people.you')})`}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {t('statistics.people.rosterEvents', { count: row.events })}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {row.hours} h
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {formatDate(row.lastActivityDate)}
                    </Typography>
                  </Box>
                </Stack>
              </ListItem>
            );
          })}
        </List>
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>{sortControl}</Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>{t('statistics.people.rosterColumnVolunteer')}</TableCell>
              <TableCell align="right">{t('statistics.people.rosterColumnHours')}</TableCell>
              <TableCell sx={{ width: '20%' }} />
              <TableCell align="right">{t('statistics.people.rosterColumnEvents')}</TableCell>
              <TableCell align="right">{t('statistics.people.rosterColumnEmergency')}</TableCell>
              <TableCell align="right">{t('statistics.people.rosterColumnSupport')}</TableCell>
              <TableCell>{t('statistics.people.rosterColumnLastActivity')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sorted.map((row, index) => {
              const isViewer = row.userId === viewerId;
              return (
                <TableRow key={row.userId} sx={{ bgcolor: isViewer ? 'action.selected' : 'transparent' }}>
                  <TableCell sx={{ color: 'text.secondary' }}>{index + 1}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Avatar sx={{ width: 28, height: 28, fontSize: 12 }}>
                        {initials(row.firstName, row.lastName)}
                      </Avatar>
                      <Typography variant="body2">
                        {row.firstName} {row.lastName}
                        {isViewer && (
                          <Typography component="span" variant="body2" color="text.secondary">
                            {' '}
                            ({t('statistics.people.you')})
                          </Typography>
                        )}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell align="right">{row.hours} h</TableCell>
                  <TableCell>
                    <Box sx={{ height: 8, bgcolor: 'action.hover', borderRadius: 1, overflow: 'hidden' }}>
                      <Box
                        sx={{
                          width: `${Math.round((row.hours / maxHours) * 100)}%`,
                          height: '100%',
                          bgcolor: colorChartSingleSeries,
                        }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell align="right">{row.events}</TableCell>
                  <TableCell align="right">{row.emergencyEvents}</TableCell>
                  <TableCell align="right">{row.supportEvents}</TableCell>
                  <TableCell sx={{ color: 'text.secondary' }}>{formatDate(row.lastActivityDate)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
