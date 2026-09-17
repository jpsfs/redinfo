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
import { OrganisationsService } from './organisations.service';
import { CreateOrganisationDto } from './dto/create-organisation.dto';
import { UpdateOrganisationDto } from './dto/update-organisation.dto';

@ApiTags('Organisations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('organisations')
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Get()
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @ApiQuery({ name: 'isRequester', required: false, type: Boolean })
  @ApiQuery({ name: 'isPayer', required: false, type: Boolean })
  findManaged(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(100), ParseIntPipe) perPage: number,
    @Query('includeInactive', new DefaultValuePipe(true), ParseBoolPipe)
    includeInactive: boolean,
    @Query('isRequester', new ParseBoolPipe({ optional: true })) isRequester?: boolean,
    @Query('isPayer', new ParseBoolPipe({ optional: true })) isPayer?: boolean,
  ) {
    return this.organisations.findManaged(page, perPage, includeInactive, isRequester, isPayer);
  }

  @Get(':id')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  findOne(@Param('id') id: string) {
    return this.organisations.findOne(id);
  }

  @Post()
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  create(@Body() dto: CreateOrganisationDto) {
    return this.organisations.create(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  update(@Param('id') id: string, @Body() dto: UpdateOrganisationDto) {
    return this.organisations.update(id, dto);
  }

  /**
   * Retires the organisation. Only actually deletes the row when no
   * agreement has ever named it as payer — see `OrganisationsService.remove`.
   */
  @Delete(':id')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  remove(@Param('id') id: string) {
    return this.organisations.remove(id);
  }
}
