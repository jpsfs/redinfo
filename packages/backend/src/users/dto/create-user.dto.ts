import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@redinfo/shared';

export class CreateUserDto {
  @ApiProperty({ example: 'joao.silva@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'João' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Silva' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: 'SecurePass1!' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: UserRole, default: UserRole.VOLUNTEER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
