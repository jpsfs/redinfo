import { IsBoolean, IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@redcross.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Admin1234!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({
    required: false,
    default: false,
    description:
      '"Keep me signed in" — issues a longer-lived refresh token when true; ' +
      'the client is also expected to persist it beyond the browser session.',
  })
  @IsOptional()
  @IsBoolean()
  remember?: boolean;
}
