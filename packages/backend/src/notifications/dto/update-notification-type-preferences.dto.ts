import { Type } from 'class-transformer';
import { ArrayMaxSize, IsBoolean, IsIn, ValidateNested } from 'class-validator';
import { NotificationType, USER_TOGGLEABLE_NOTIFICATION_TYPES } from '@redinfo/shared';

class NotificationTypePreferenceItemDto {
  @IsIn(USER_TOGGLEABLE_NOTIFICATION_TYPES)
  type: NotificationType;

  @IsBoolean()
  enabled: boolean;
}

/** `PUT /notifications/type-preferences` body — a member's own toggle for shift reminders/birthdays. */
export class UpdateNotificationTypePreferencesDto {
  @ValidateNested({ each: true })
  @Type(() => NotificationTypePreferenceItemDto)
  @ArrayMaxSize(USER_TOGGLEABLE_NOTIFICATION_TYPES.length)
  preferences: NotificationTypePreferenceItemDto[];
}
