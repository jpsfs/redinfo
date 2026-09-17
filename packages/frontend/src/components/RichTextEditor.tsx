import { useEffect } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Box, Divider, IconButton, Paper, Stack } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import { useT } from '../i18n/useT';

/**
 * A minimal rich-text field for narrative reports — the first use of rich
 * text anywhere in the app.
 *
 * TipTap is headless by design, so this owns its own MUI toolbar rather than
 * pulling in a prebuilt UI kit, matching how every other input here is
 * styled. `StarterKit` only (paragraphs, bold, italic, lists) for v1; no
 * images, tables or links until a real need for them shows up. Content is
 * read and written as HTML — sanitized on submit and again on render (see
 * `RichTextViewer`), since stored HTML is never trusted on either side of
 * the round trip.
 */
export const RichTextEditor = ({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (html: string) => void;
  disabled?: boolean;
}) => {
  const t = useT();
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
  });

  // TipTap never re-reads `content` after mount, so an external reset (the
  // form loading a different record, or clearing after save) has to be
  // pushed into the editor's own buffer explicitly.
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  if (!editor) return null;

  const ToolbarButton = ({
    active,
    label,
    onClick,
    children,
  }: {
    active: boolean;
    label: string;
    onClick: () => void;
    children: React.ReactNode;
  }) => (
    <IconButton
      size="small"
      color={active ? 'primary' : 'default'}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </IconButton>
  );

  return (
    <Paper variant="outlined">
      <Stack
        direction="row"
        spacing={0.5}
        alignItems="center"
        sx={{ p: 0.5, borderBottom: '1px solid', borderColor: 'divider' }}
      >
        <ToolbarButton
          active={editor.isActive('bold')}
          label={t('richText.bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <FormatBoldIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          label={t('richText.italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <FormatItalicIcon fontSize="small" />
        </ToolbarButton>
        <Divider orientation="vertical" flexItem />
        <ToolbarButton
          active={editor.isActive('bulletList')}
          label={t('richText.bulletedList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <FormatListBulletedIcon fontSize="small" />
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          label={t('richText.numberedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <FormatListNumberedIcon fontSize="small" />
        </ToolbarButton>
      </Stack>
      <Box
        sx={{
          p: 1.5,
          minHeight: 160,
          '& .ProseMirror': { outline: 'none' },
        }}
      >
        <EditorContent editor={editor} />
      </Box>
    </Paper>
  );
};
