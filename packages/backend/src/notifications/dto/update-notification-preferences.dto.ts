import { Type } from 'class-transformer';
import { ArrayMaxSize, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { NotificationChannel } from '@redinfo/shared';

/** `IN_APP` is always on and never sent here — only the channels a member can actually opt out of. */
const OPTIONAL_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH];

class NotificationPreferenceItemDto {
  @IsIn(OPTIONAL_CHANNELS)
  channel: NotificationChannel;

  @IsBoolean()
  enabled: boolean;
}

export class UpdateNotificationPreferencesDto {
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceItemDto)
  @ArrayMaxSize(OPTIONAL_CHANNELS.length)
  preferences: NotificationPreferenceItemDto[];
}
