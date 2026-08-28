import {
  CreateButton,
  Datagrid,
  FunctionField,
  List,
  SearchInput,
  SelectInput,
  TextField,
  TopToolbar,
  useListContext,
} from 'react-admin';
import { useNavigate } from 'react-router-dom';
import { Box, Chip, CircularProgress, Stack } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import { InventoryItemType, MaterialItem } from '@redinfo/shared';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useT } from '../../i18n/useT';
import { MaterialItemCard } from './MaterialItemCard';

const ListActions = () => (
  <TopToolbar>
    <CreateButton />
  </TopToolbar>
);

/** Stacked cards instead of a table — the mobile replacement for `Datagrid`. */
const MobileMaterialItemList = () => {
  const { data, isLoading } = useListContext<MaterialItem>();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Stack spacing={1.5}>
      {(data ?? []).map((item) => (
        <MaterialItemCard
          key={item.id}
          item={item}
          onOpen={() => navigate(`/material-items/${item.id}`)}
        />
      ))}
    </Stack>
  );
};

/**
 * The materials catalogue: the shared identity behind every vehicle's
 * inventory template row and every consumption line (#206). Coordinators
 * maintain it here — including which items are pinned as favourites for the
 * quick-access picker — without a deploy.
 */
export const MaterialItemList = () => {
  const t = useT();
  const isMobile = useIsMobile();

  const typeChoices = [
    { id: InventoryItemType.COUNTABLE, name: t('itemType.COUNTABLE') },
    { id: InventoryItemType.UNLIMITED, name: t('itemType.UNLIMITED') },
  ];

  const materialItemFilters = [
    <SearchInput
      source="q"
      alwaysOn
      key="q"
      placeholder={t('materialItemList.searchPlaceholder')}
    />,
    <SelectInput source="type" key="type" choices={typeChoices} />,
  ];

  return (
    <List filters={materialItemFilters} actions={<ListActions />} sort={{ field: 'namePt', order: 'ASC' }}>
      {isMobile ? (
        <MobileMaterialItemList />
      ) : (
        <Datagrid rowClick="edit" bulkActionButtons={false}>
          <TextField source="namePt" />
          <TextField source="nameEn" emptyText="—" />
          <TextField source="unit" />
          <FunctionField
            source="type"
            render={(record: MaterialItem) =>
              record.type === InventoryItemType.UNLIMITED ? t('itemType.UNLIMITED') : t('itemType.COUNTABLE')
            }
          />
          <FunctionField
            source="barcodes"
            label={t('resources.material-items.fields.barcodes')}
            render={(record: MaterialItem) => record.barcodes?.length ?? 0}
          />
          <FunctionField
            source="isFrequent"
            label={t('materialItemList.favourite')}
            render={(record: MaterialItem) =>
              record.isFrequent ? (
                <Chip
                  size="small"
                  icon={<StarIcon fontSize="small" />}
                  label={t('materialItemList.favourite')}
                  color="warning"
                  variant="outlined"
                />
              ) : (
                '—'
              )
            }
          />
        </Datagrid>
      )}
    </List>
  );
};
