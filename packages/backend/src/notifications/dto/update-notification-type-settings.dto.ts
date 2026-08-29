import { ArrayUnique, IsArray, IsIn } from 'class-validator';
import { NotificationChannel } from '@redinfo/shared';

const CONFIGURABLE_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH];

/**
 * `PUT /notifications/config/:type` body — the full set of channels enabled
 * org-wide for that notification type. `IN_APP` is never in this list; it
 * isn't optional, so the config page shows it as an always-on row instead.
 */
export class UpdateNotificationTypeSettingsDto {
  @IsArray()
  @ArrayUnique()
  @IsIn(CONFIGURABLE_CHANNELS, { each: true })
  channels: NotificationChannel[];
}
