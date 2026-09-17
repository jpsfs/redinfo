import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { NoticeTargetType, NotificationChannel, UserRole } from '@redinfo/shared';

/** `IN_APP` is implicit on every notice — a coordinator only ever chooses among these. */
const SELECTABLE_CHANNELS = [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH];

export class CreateNoticeDto {
  @IsString()
  @MaxLength(200)
  title: string;

  @IsString()
  @MaxLength(4000)
  body: string;

  @IsEnum(NoticeTargetType)
  targetType: NoticeTargetType;

  /** Required, non-empty when `targetType` is `ROLES`; ignored otherwise. */
  @ValidateIf((dto: CreateNoticeDto) => dto.targetType === NoticeTargetType.ROLES)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsEnum(UserRole, { each: true })
  targetRoles?: UserRole[];

  @IsArray()
  @ArrayUnique()
  @IsIn(SELECTABLE_CHANNELS, { each: true })
  channels: NotificationChannel[];

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
