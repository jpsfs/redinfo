import { IsOptional, IsString, IsUrl } from 'class-validator';

/** Mirrors the browser's `PushSubscription.toJSON()` shape. */
export class RegisterPushSubscriptionDto {
  @IsUrl({ require_tld: false })
  endpoint: string;

  @IsString()
  p256dh: string;

  @IsString()
  auth: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}
