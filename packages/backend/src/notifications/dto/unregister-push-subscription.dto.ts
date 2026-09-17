import { IsUrl } from 'class-validator';

export class UnregisterPushSubscriptionDto {
  @IsUrl({ require_tld: false })
  endpoint: string;
}
