import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Action, TransportRequestDecision } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { TransportRequestsService, RequestUser } from './transport-requests.service';
import { TransportRequestTreatmentPlansService } from './transport-request-treatment-plans.service';
import { TransportRequestLegsService } from './transport-request-legs.service';
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { UpdateTransportRequestDto } from './dto/update-transport-request.dto';
import { DecideTransportRequestDto } from './dto/decide-transport-request.dto';
import { CreateTreatmentPlanDto } from './dto/create-treatment-plan.dto';
import { UpdateTreatmentPlanDto } from './dto/update-treatment-plan.dto';
import { UpdateTransportLegDto } from './dto/update-transport-leg.dto';
import { CancelTransportLegDto } from './dto/cancel-transport-leg.dto';

/**
 * Referral intake (#228). Every route is gated `MANAGE_TRANSPORT_REQUESTS` —
 * unlike `Patient`, a referral carries nothing narrower-than-its-neighbour to
 * split off into its own action.
 */
@ApiTags('Transport requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('transport-requests')
export class TransportRequestsController {
  constructor(
    private readonly transportRequests: TransportRequestsService,
    private readonly treatmentPlans: TransportRequestTreatmentPlansService,
    private readonly legs: TransportRequestLegsService,
  ) {}

  @Get()
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'decision', required: false, enum: TransportRequestDecision })
  @ApiQuery({
    name: 'awaitingExternalRegistration',
    required: false,
    type: Boolean,
    description: 'Accepted but not yet marked registado na plataforma externa. Overrides `decision`.',
  })
  findManaged(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('decision') decision?: TransportRequestDecision,
    @Query('awaitingExternalRegistration') awaitingExternalRegistration?: string,
  ) {
    return this.transportRequests.findManaged(page, perPage, decision, awaitingExternalRegistration === 'true');
  }

  @Get(':id')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  findOne(@Param('id') id: string) {
    return this.transportRequests.findOne(id);
  }

  /** The decision page's (#229) roster/absences/vehicle-occupancy snapshot
   * for this referral's appointment date — see `TransportRequestsService.getFeasibility`. */
  @Get(':id/feasibility')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  getFeasibility(@Param('id') id: string) {
    return this.transportRequests.getFeasibility(id);
  }

  @Post()
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  create(@Body() dto: CreateTransportRequestDto, @CurrentUser() user: RequestUser) {
    return this.transportRequests.create(dto, user);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  update(@Param('id') id: string, @Body() dto: UpdateTransportRequestDto) {
    return this.transportRequests.update(id, dto);
  }

  /** Accept or reject — see `TransportRequestsService.decide`. */
  @Post(':id/decide')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  decide(
    @Param('id') id: string,
    @Body() dto: DecideTransportRequestDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.transportRequests.decide(id, dto, user);
  }

  /** Stamps `externallyRegisteredAt` — see `TransportRequestsService.registerExternally`. */
  @Post(':id/register-external')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  registerExternally(@Param('id') id: string) {
    return this.transportRequests.registerExternally(id);
  }

  @Delete(':id')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  remove(@Param('id') id: string) {
    return this.transportRequests.remove(id);
  }

  // ─── Treatment plans (#230) ──────────────────────────────────────────────

  @Get(':id/treatment-plans')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  findTreatmentPlans(@Param('id') id: string) {
    return this.treatmentPlans.findAllForRequest(id);
  }

  /** Creating a plan materialises its legs immediately — see
   * `TransportRequestTreatmentPlansService.create`. */
  @Post(':id/treatment-plans')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  createTreatmentPlan(@Param('id') id: string, @Body() dto: CreateTreatmentPlanDto) {
    return this.treatmentPlans.create(id, dto);
  }

  /** Re-runs the generator afterwards — see
   * `TransportRequestTreatmentPlansService.update`. */
  @Patch('treatment-plans/:planId')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  updateTreatmentPlan(@Param('planId') planId: string, @Body() dto: UpdateTreatmentPlanDto) {
    return this.treatmentPlans.update(planId, dto);
  }

  // ─── Transport legs (#230) ───────────────────────────────────────────────

  @Get(':id/legs')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  findLegs(@Param('id') id: string) {
    return this.legs.findAllForRequest(id);
  }

  /** For a referral with no `TreatmentPlan` at all — see
   * `TransportRequestLegsService.generateOneOff`. */
  @Post(':id/legs/generate-one-off')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  generateOneOffLegs(@Param('id') id: string) {
    return this.legs.generateOneOff(id);
  }

  /** Address/facility/time detail, plus a reschedule via `date` — never
   * touches the plan above the leg. */
  @Patch('legs/:legId')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  updateLeg(@Param('legId') legId: string, @Body() dto: UpdateTransportLegDto) {
    return this.legs.update(legId, dto);
  }

  @Post('legs/:legId/cancel')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  cancelLeg(@Param('legId') legId: string, @Body() dto: CancelTransportLegDto) {
    return this.legs.cancel(legId, dto);
  }

  @Post('legs/:legId/no-show')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  markLegNoShow(@Param('legId') legId: string) {
    return this.legs.markNoShow(legId);
  }
}
