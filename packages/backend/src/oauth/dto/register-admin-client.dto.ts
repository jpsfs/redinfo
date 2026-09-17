import { ArrayMinSize, IsArray, IsString, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterAdminClientDto {
  /** e.g. "Microsoft Copilot Studio". Shown to the user on the consent screen. */
  @ApiProperty()
  @IsString()
  clientName: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUrl({ require_tld: false }, { each: true })
  redirectUris: string[];
}
