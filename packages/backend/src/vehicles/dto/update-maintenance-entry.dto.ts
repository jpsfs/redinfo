import { PartialType } from '@nestjs/swagger';
import { CreateMaintenanceEntryDto } from './create-maintenance-entry.dto';

export class UpdateMaintenanceEntryDto extends PartialType(CreateMaintenanceEntryDto) {}
