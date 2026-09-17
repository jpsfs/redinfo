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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { PatientsService, RequestUser } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

/**
 * Non-urgent transport patients (#219, #226).
 *
 * Every route here is gated `MANAGE_PATIENTS`; whether the sealed `identity`
 * blob is actually part of the response is a per-row, per-caller decision
 * `PatientsService` makes against `VIEW_PATIENT_IDENTITY` — a narrower
 * capability, deliberately not implied — so there is no separate route to
 * gate for it.
 */
@ApiTags('Patients')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Get()
  @Actions(Action.MANAGE_PATIENTS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findManaged(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('includeInactive', new DefaultValuePipe(true), ParseBoolPipe)
    includeInactive: boolean,
    @CurrentUser() user: RequestUser,
  ) {
    return this.patients.findManaged(user, page, perPage, includeInactive);
  }

  @Get(':id')
  @Actions(Action.MANAGE_PATIENTS)
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.patients.findOne(id, user);
  }

  @Post()
  @Actions(Action.MANAGE_PATIENTS)
  create(@Body() dto: CreatePatientDto, @CurrentUser() user: RequestUser) {
    return this.patients.create(dto, user);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_PATIENTS)
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePatientDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.patients.update(id, dto, user);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_PATIENTS)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.patients.remove(id, user);
  }
}
