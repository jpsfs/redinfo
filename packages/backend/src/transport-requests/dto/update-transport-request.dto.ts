import { PartialType } from '@nestjs/swagger';
import { CreateTransportRequestDto } from './create-transport-request.dto';

export class UpdateTransportRequestDto extends PartialType(CreateTransportRequestDto) {}
