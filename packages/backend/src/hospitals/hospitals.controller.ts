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
import { HospitalsService } from './hospitals.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';
import { UpdateHospitalDto } from './dto/update-hospital.dto';

@ApiTags('Hospitals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('hospitals')
export class HospitalsController {
  constructor(private readonly hospitals: HospitalsService) {}

  /**
   * The picker list — active hospitals, nearest to `localityId` first.
   *
   * Ungated: anyone who can file a report has to be able to say where they
   * took someone, and this route hands back nothing a coordinator would
   * withhold. Declared before `:id` so "picker" is never read as an id.
   */
  @Get('picker')
  @ApiQuery({ name: 'localityId', required: false, type: String })
  picker(@Query('localityId') localityId?: string) {
    return this.hospitals.findForPicker(localityId);
  }

  @Get()
  @Actions(Action.MANAGE_HOSPITALS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(100), ParseIntPipe) perPage: number,
    @Query('includeInactive', new DefaultValuePipe(true), ParseBoolPipe)
    includeInactive: boolean,
  ) {
    return this.hospitals.findAll(page, perPage, includeInactive);
  }

  @Get(':id')
  @Actions(Action.MANAGE_HOSPITALS)
  findOne(@Param('id') id: string) {
    return this.hospitals.findOne(id);
  }

  @Post()
  @Actions(Action.MANAGE_HOSPITALS)
  create(@Body() dto: CreateHospitalDto) {
    return this.hospitals.create(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_HOSPITALS)
  update(@Param('id') id: string, @Body() dto: UpdateHospitalDto) {
    return this.hospitals.update(id, dto);
  }

  /**
   * Retires the hospital. Only actually deletes the row when no report has
   * ever named it — see `HospitalsService.remove`.
   */
  @Delete(':id')
  @Actions(Action.MANAGE_HOSPITALS)
  remove(@Param('id') id: string) {
    return this.hospitals.remove(id);
  }
}
