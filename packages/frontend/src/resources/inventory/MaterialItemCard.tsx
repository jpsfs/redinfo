import { Chip, Paper, Stack, Typography } from '@mui/material';
import StarIcon from '@mui/icons-material/Star';
import { InventoryItemType, MaterialItem } from '@redinfo/shared';
import { useT } from '../../i18n/useT';

/**
 * One catalogue entry, as a stacked card — the mobile replacement for a row
 * of the desktop `Datagrid` on `/material-items`. Same fields as the table,
 * laid out for a thumb rather than a cursor (#206).
 */
export const MaterialItemCard = ({
  item,
  onOpen,
}: {
  item: MaterialItem;
  onOpen: () => void;
}) => {
  const t = useT();
  const barcodeCount = item.barcodes?.length ?? 0;

  return (
    <Paper variant="outlined" onClick={onOpen} sx={{ p: 2, cursor: 'pointer' }}>
      <Stack spacing={0.75}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography sx={{ fontWeight: 700 }}>{item.namePt}</Typography>
          {item.isFrequent && (
            <StarIcon fontSize="small" color="warning" titleAccess={t('materialItemList.favourite')} />
          )}
        </Stack>

        {item.nameEn && (
          <Typography variant="body2" color="text.secondary">
            {item.nameEn}
          </Typography>
        )}

        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Chip
            size="small"
            label={item.type === InventoryItemType.UNLIMITED ? t('itemType.UNLIMITED') : t('itemType.COUNTABLE')}
            variant="outlined"
          />
          <Typography variant="body2" color="text.secondary">
            {item.unit}
          </Typography>
          <Typography variant="caption" color="text.disabled">
            {t('materialItemList.barcodeCount', { count: barcodeCount })}
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
};
