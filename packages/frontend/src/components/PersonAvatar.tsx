import { Avatar, SxProps, Theme } from '@mui/material';
import { useAuthenticatedPhoto } from '../hooks/useAuthenticatedPhoto';

export interface PersonAvatarProps {
  userId: string;
  hasPhoto: boolean;
  /** Shown while there is no photo, or while it is still loading. */
  initials: string;
  size?: number;
  sx?: SxProps<Theme>;
}

/**
 * A person's avatar — their uploaded photo when there is one, their initials
 * otherwise. The photo itself comes from `GET /users/:id/photo`, which needs
 * a bearer token (see `useAuthenticatedPhoto`), so this never sets `src`
 * directly to that URL.
 */
export const PersonAvatar = ({ userId, hasPhoto, initials, size = 72, sx }: PersonAvatarProps) => {
  const src = useAuthenticatedPhoto(userId, hasPhoto);

  return (
    <Avatar
      src={src ?? undefined}
      sx={[{ width: size, height: size, fontSize: size / 2.4 }, ...(Array.isArray(sx) ? sx : sx ? [sx] : [])]}
    >
      {!src && initials}
    </Avatar>
  );
};
