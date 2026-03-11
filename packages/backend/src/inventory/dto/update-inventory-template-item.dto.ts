import { PartialType, OmitType } from '@nestjs/swagger';
import { CreateInventoryTemplateItemDto } from './create-inventory-template-item.dto';

export class UpdateInventoryTemplateItemDto extends PartialType(
  OmitType(CreateInventoryTemplateItemDto, ['templateId'] as const),
) {}
