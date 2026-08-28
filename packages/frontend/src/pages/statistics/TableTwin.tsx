import { Box } from '@mui/material';
import { useT } from '../../i18n/useT';

export interface TableTwinProps {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * The "Ver dados em tabela" twin every chart in
 * docs/plans/estatisticas-dashboards.md §6 carries: the same numbers a chart
 * draws, as a plain table, collapsed by default. What a screen reader (or a
 * label too long to fit its bar) falls back to — never `overflow: hidden`.
 */
export const TableTwin = ({ headers, rows }: TableTwinProps) => {
  const t = useT();
  return (
    <Box component="details" sx={{ mt: 1 }}>
      <Box component="summary" sx={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'text.secondary', py: 0.5 }}>
        {t('statistics.tableTwinToggle')}
      </Box>
      <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', mt: 0.5 }}>
        <Box component="thead">
          <Box component="tr">
            {headers.map((h, i) => (
              <Box
                component="th"
                key={h}
                sx={{ textAlign: i === 0 ? 'left' : 'right', py: 0.5, borderBottom: 1, borderColor: 'divider' }}
              >
                {h}
              </Box>
            ))}
          </Box>
        </Box>
        <Box component="tbody">
          {rows.map((row) => (
            <Box component="tr" key={row.join('|')}>
              {row.map((cell, ci) => (
                <Box
                  component="td"
                  key={`${row[0]}-${ci}`}
                  sx={{ textAlign: ci === 0 ? 'left' : 'right', py: 0.5, borderBottom: 1, borderColor: 'divider' }}
                >
                  {cell}
                </Box>
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  );
};
