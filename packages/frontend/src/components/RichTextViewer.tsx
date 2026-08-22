import DOMPurify from 'dompurify';
import { Box } from '@mui/material';

/**
 * Read-only rendering of a `RichTextEditor` field.
 *
 * Sanitized here too, not just on write — stored HTML is never trusted on
 * either side of the round trip.
 */
export const RichTextViewer = ({ html }: { html: string }) => (
  <Box
    sx={{
      '& p': { mt: 0, mb: 1 },
      '& p:last-child': { mb: 0 },
      '& ul, & ol': { pl: 3, mb: 1 },
    }}
    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(html) }}
  />
);
