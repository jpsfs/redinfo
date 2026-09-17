import { useEffect, useMemo, useState } from 'react';
import { ReferenceInput, SelectInput, TextInput, required, useInput, useRecordContext } from 'react-admin';
import { Autocomplete, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { FacilityWithDistance, TransportRequest, foldForSearch } from '@redinfo/shared';
import { apiFetch } from '../../api';
import { useT } from '../../i18n/useT';

/**
 * `destinationFacilityId` / `destinationFacility` — exactly one is submitted,
 * never both (#228). A private hospital in Porto will not be in a table
 * seeded with emergency rooms, so this offers a create-if-missing escape
 * hatch rather than blocking the coordinator on a `MANAGE_HOSPITALS` errand.
 *
 * Reads `/facilities/transport` directly (`apiFetch`, the same call
 * `HospitalPicker` makes) rather than a `<ReferenceInput reference="facilities">`
 * — the managed `/facilities` list needs `MANAGE_HOSPITALS`, which a
 * `TRANSPORT_COORDINATOR` does not hold; the picker route is ungated.
 */
export const DestinationFacilityField = () => {
  const t = useT();
  const record = useRecordContext<TransportRequest>();
  const { field: idField } = useInput({ source: 'destinationFacilityId' });
  const { field: newField } = useInput({ source: 'destinationFacility' });
  const [creatingNew, setCreatingNew] = useState(false);
  const [options, setOptions] = useState<FacilityWithDistance[] | null>(null);
  const [chosen, setChosen] = useState<FacilityWithDistance | null>(
    record?.destinationFacility ? { ...record.destinationFacility, distanceKm: null, approximate: false } : null,
  );

  useEffect(() => {
    let cancelled = false;
    apiFetch<FacilityWithDistance[]>('/facilities/transport')
      .then((found) => {
        if (!cancelled) setOptions(found);
      })
      .catch(() => {
        if (!cancelled) setOptions([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The record's own destination may not be in `/facilities/transport` yet
  // on first paint (still loading) — keep it selectable regardless.
  const choices = useMemo(() => {
    if (!chosen) return options ?? [];
    if ((options ?? []).some((option) => option.id === chosen.id)) return options ?? [];
    return [...(options ?? []), chosen];
  }, [options, chosen]);

  const switchToNew = () => {
    setCreatingNew(true);
    setChosen(null);
    idField.onChange(undefined);
    newField.onChange({ name: '', municipalityId: '' });
  };

  const switchToExisting = () => {
    setCreatingNew(false);
    newField.onChange(undefined);
  };

  if (creatingNew) {
    return (
      <Stack spacing={1} sx={{ mb: 2 }}>
        <Typography variant="subtitle2">{t('transportRequestForm.destinationNew')}</Typography>
        <TextInput
          source="destinationFacility.name"
          label={t('transportRequestForm.destinationName')}
          validate={required()}
          fullWidth
        />
        <ReferenceInput source="destinationFacility.municipalityId" reference="municipalities" perPage={400}>
          <SelectInput
            label={t('transportRequestForm.destinationMunicipality')}
            optionText={(option) => `${option.name} · ${option.district}`}
            validate={required()}
            fullWidth
          />
        </ReferenceInput>
        <TextInput
          source="destinationFacility.addressLine"
          label={t('transportRequestForm.destinationAddress')}
          fullWidth
        />
        <TextInput
          source="destinationFacility.postalCode"
          label={t('transportRequestForm.destinationPostalCode')}
          fullWidth
        />
        <Button size="small" onClick={switchToExisting} sx={{ alignSelf: 'flex-start' }}>
          {t('transportRequestForm.useExistingDestination')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={1} sx={{ mb: 2 }}>
      <Typography variant="subtitle2">{t('transportRequestForm.destinationExisting')}</Typography>
      <Autocomplete
        options={choices}
        loading={options === null}
        value={chosen}
        getOptionLabel={(option) => option.name}
        filterOptions={(items, state) => {
          const folded = foldForSearch(state.inputValue);
          if (!folded) return items;
          return items.filter((item) => foldForSearch(item.name).includes(folded));
        }}
        isOptionEqualToValue={(option, value) => option.id === value.id}
        onChange={(_event, value) => {
          setChosen(value);
          idField.onChange(value?.id);
        }}
        renderInput={(params) => (
          <TextField
            {...params}
            label={t('resources.transport-requests.fields.destinationFacilityId')}
            placeholder={t('transportRequestForm.noDestinationChosen')}
            InputProps={{
              ...params.InputProps,
              endAdornment: (
                <>
                  {options === null ? <CircularProgress size={16} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            }}
          />
        )}
        renderOption={(props, option) => (
          <Box component="li" {...props} key={option.id}>
            <Stack>
              <Typography variant="body2">{option.name}</Typography>
              {option.municipality?.name && (
                <Typography variant="caption" color="text.secondary">
                  {option.municipality.name}
                </Typography>
              )}
            </Stack>
          </Box>
        )}
      />
      <Button size="small" onClick={switchToNew} sx={{ alignSelf: 'flex-start' }}>
        {t('transportRequestForm.addNewDestination')}
      </Button>
    </Stack>
  );
};
