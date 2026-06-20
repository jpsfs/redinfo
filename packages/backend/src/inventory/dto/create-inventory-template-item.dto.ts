import {
  IsString,
  IsEnum,
  IsOptional,
  IsInt,
  IsNotEmpty,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InventoryItemType } from '@redinfo/shared';

export class CreateInventoryTemplateItemDto {
  @ApiProperty({ description: 'Template ID this item belongs to' })
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @ApiProperty({ example: 'First Aid Kit' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: InventoryItemType, default: InventoryItemType.COUNTABLE })
  @IsEnum(InventoryItemType)
  type: InventoryItemType;

  @ApiPropertyOptional({ example: 2, description: 'Recommended quantity (null for UNLIMITED)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  recommendedQuantity?: number;

  @ApiProperty({ example: 'pcs', default: 'pcs' })
  @IsString()
  @IsNotEmpty()
  unit: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;
}
