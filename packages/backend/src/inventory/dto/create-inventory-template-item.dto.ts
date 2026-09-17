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

  /**
   * The new, catalogue-driven identity of the row (#206). When set,
   * `name`/`type`/`unit` are read through from the `MaterialItem` and any
   * value sent for them below is ignored — see `InventoryService`. Optional
   * only for the legacy free-text path some older callers still use;
   * omitting it AND `name` is rejected.
   */
  @ApiPropertyOptional({ description: 'MaterialItem catalogue entry this row is for' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  materialItemId?: string;

  @ApiPropertyOptional({
    example: 'First Aid Kit',
    description: 'Legacy free-text name, ignored once materialItemId is set',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ enum: InventoryItemType, description: 'Legacy free-text type, ignored once materialItemId is set' })
  @IsOptional()
  @IsEnum(InventoryItemType)
  type?: InventoryItemType;

  @ApiPropertyOptional({ example: 2, description: 'Recommended quantity (null for UNLIMITED)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  recommendedQuantity?: number;

  @ApiPropertyOptional({
    example: 'pcs',
    description: 'Legacy free-text unit, ignored once materialItemId is set',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string;

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
