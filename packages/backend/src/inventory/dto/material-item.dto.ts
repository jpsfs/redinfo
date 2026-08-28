import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  IsEnum,
  IsArray,
  ArrayMaxSize,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { InventoryItemType } from '@redinfo/shared';

export class MaterialItemBarcodeDto {
  @ApiProperty({ example: '5601234567890', description: 'EAN/GS1 code on the box' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code: string;

  @ApiPropertyOptional({ example: 'Caixa de 100' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateMaterialItemDto {
  @ApiProperty({ example: 'Luvas' })
  @IsString()
  @IsNotEmpty()
  namePt: string;

  @ApiPropertyOptional({ example: 'Gloves' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ example: 'pcs', default: 'pcs' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string;

  @ApiProperty({ enum: InventoryItemType, default: InventoryItemType.COUNTABLE })
  @IsEnum(InventoryItemType)
  type: InventoryItemType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFrequent?: boolean;

  @ApiPropertyOptional({ example: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  frequentOrder?: number;

  @ApiPropertyOptional({
    type: [MaterialItemBarcodeDto],
    description: 'Replaces the item\'s whole barcode set.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MaterialItemBarcodeDto)
  barcodes?: MaterialItemBarcodeDto[];
}

export class UpdateMaterialItemDto {
  @ApiPropertyOptional({ example: 'Luvas' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  namePt?: string;

  @ApiPropertyOptional({ example: 'Gloves' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ example: 'pcs' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  unit?: string;

  @ApiPropertyOptional({ enum: InventoryItemType })
  @IsOptional()
  @IsEnum(InventoryItemType)
  type?: InventoryItemType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFrequent?: boolean;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  frequentOrder?: number;

  @ApiPropertyOptional({
    type: [MaterialItemBarcodeDto],
    description: 'Replaces the item\'s whole barcode set. Omit to leave barcodes untouched.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => MaterialItemBarcodeDto)
  barcodes?: MaterialItemBarcodeDto[];
}
