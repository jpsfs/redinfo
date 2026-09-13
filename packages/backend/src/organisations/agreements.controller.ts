import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseBoolPipe,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Action } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { AgreementsService } from './agreements.service';
import { CreateAgreementDto } from './dto/create-agreement.dto';
import { UpdateAgreementDto } from './dto/update-agreement.dto';

@ApiTags('Agreements')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('agreements')
export class AgreementsController {
  constructor(private readonly agreements: AgreementsService) {}

  @Get()
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'payerOrganisationId', required: false, type: String })
  findManaged(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(100), ParseIntPipe) perPage: number,
    @Query('includeInactive', new DefaultValuePipe(true), ParseBoolPipe)
    includeInactive: boolean,
    @Query('payerOrganisationId') payerOrganisationId?: string,
  ) {
    return this.agreements.findManaged(page, perPage, includeInactive, payerOrganisationId);
  }

  @Get(':id')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  findOne(@Param('id') id: string) {
    return this.agreements.findOne(id);
  }

  @Post()
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  create(@Body() dto: CreateAgreementDto) {
    return this.agreements.create(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  update(@Param('id') id: string, @Body() dto: UpdateAgreementDto) {
    return this.agreements.update(id, dto);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  remove(@Param('id') id: string) {
    return this.agreements.remove(id);
  }
}
