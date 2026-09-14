import { useCallback, useState } from 'react';
import { Show, SimpleShowLayout, useRecordContext } from 'react-admin';
import { Box, Stack, Typography } from '@mui/material';
import { TransportRequest } from '@redinfo/shared';
import { useT } from '../../i18n/useT';
import { DecisionChip } from './index';
import { TreatmentPlanPanel } from './TreatmentPlanPanel';
import { TransportLegPanel } from './TransportLegPanel';

/**
 * The request detail (#230): the referral's own envelope (read-only — `Edit`
 * covers changing it) plus the two panels the story actually asked for — a
 * treatment plan editor and the leg list it (and one-off generation) feeds.
 * Reached from `TransportRequestEdit`'s default `ShowButton`, same as
 * `PatientShow` off `PatientEdit` — the list itself still `rowClick="edit"`.
 */

const RequestSummary = () => {
  const t = useT();
  const record = useRecordContext<TransportRequest>();
  if (!record) return null;
  return (
    <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
      <Typography variant="h6">{record.externalServiceNumber}</Typography>
      <DecisionChip decision={record.decision} />
      <Typography variant="body2" color="text.secondary">
        {record.requestingOrganisation?.name ?? '—'} → {record.destinationFacility?.name ?? '—'}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {t(`transportRequestOccurrenceType.${record.occurrenceType}`)}
      </Typography>
    </Stack>
  );
};

const Panels = () => {
  const record = useRecordContext<TransportRequest>();
  const [legsReloadToken, setLegsReloadToken] = useState(0);
  const [hasTreatmentPlan, setHasTreatmentPlan] = useState(false);

  // Bumped both by a create/update (which regenerates legs server-side) and
  // by the panel's own initial load, so "generate one-off" stays hidden for
  // a request that already had a plan before this screen was even opened.
  const bumpLegsReload = useCallback(() => setLegsReloadToken((n) => n + 1), []);

  if (!record) return null;

  return (
    <Stack spacing={2} sx={{ mt: 2 }}>
      <TreatmentPlanPanel
        transportRequestId={record.id}
        onLegsChanged={bumpLegsReload}
        onPlansLoaded={setHasTreatmentPlan}
      />
      <TransportLegPanel
        transportRequestId={record.id}
        hasTreatmentPlan={hasTreatmentPlan}
        reloadToken={legsReloadToken}
      />
    </Stack>
  );
};

export const TransportRequestShow = () => (
  <Show>
    <SimpleShowLayout>
      <RequestSummary />
      <Box>
        <Panels />
      </Box>
    </SimpleShowLayout>
  </Show>
);
