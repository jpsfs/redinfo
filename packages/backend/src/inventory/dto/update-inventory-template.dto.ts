import { PartialType } from '@nestjs/swagger';
import { CreateInventoryTemplateDto } from './create-inventory-template.dto';

export class UpdateInventoryTemplateDto extends PartialType(CreateInventoryTemplateDto) {}
