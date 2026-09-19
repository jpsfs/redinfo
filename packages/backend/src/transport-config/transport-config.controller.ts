import { BadRequestException, Body, Controller, Get, Param, Patch, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Action,
  TransportRequestOccurrenceType,
  validateArrivalWindowThresholds,
  validateOccurrenceTypePolicy,
  validatePatientHandlingThresholds,
} from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { DelegationSettingsService } from '../live-runs/delegation-settings.service';
import { OccurrenceTypePoliciesService } from './occurrence-type-policies.service';
import { UpdateArrivalWindowThresholdsDto } from './dto/update-arrival-window-thresholds.dto';
import { UpdateOccurrenceTypePolicyDto } from './dto/update-occurrence-type-policy.dto';
import { UpdatePatientHandlingThresholdsDto } from './dto/update-patient-handling-thresholds.dto';

/**
 * Planning policy for non-urgent transport (#233): arrival window thresholds,
 * per-patient pickup/dropoff handling time, and occurrence-type duration
 * floors — all config a coordinator can change without a deploy. Every route
 * gated `MANAGE_TRANSPORT_CONFIG`, the same action `organisations`/
 * `agreements` use for transport reference data.
 *
 * Reuses `DelegationSettingsService` for the thresholds and handling minutes
 * rather than owning a second table — they live on the same
 * `DelegationSettings` singleton row as the base/CODU fields `live-runs`
 * writes; `update` merges a patch so each screen only ever touches the slice
 * it owns.
 */
@ApiTags('Transport config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('transport-config')
export class TransportConfigController {
  constructor(
    private readonly settings: DelegationSettingsService,
    private readonly policies: OccurrenceTypePoliciesService,
  ) {}

  @Get('arrival-window-thresholds')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  async arrivalWindowThresholds() {
    const { arrivalWindowEarliestMinutes, arrivalWindowLatestMinutes, arrivalToleranceMinutes } =
      await this.settings.get();
    return { arrivalWindowEarliestMinutes, arrivalWindowLatestMinutes, arrivalToleranceMinutes };
  }

  @Put('arrival-window-thresholds')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  async updateArrivalWindowThresholds(@Body() dto: UpdateArrivalWindowThresholdsDto) {
    const error = validateArrivalWindowThresholds(dto);
    if (error) throw new BadRequestException(error);
    const { arrivalWindowEarliestMinutes, arrivalWindowLatestMinutes, arrivalToleranceMinutes } =
      await this.settings.update(dto);
    return { arrivalWindowEarliestMinutes, arrivalWindowLatestMinutes, arrivalToleranceMinutes };
  }

  @Get('patient-handling-thresholds')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  async patientHandlingThresholds() {
    const { pickupHandlingMinutes, dropoffHandlingMinutes } = await this.settings.get();
    return { pickupHandlingMinutes, dropoffHandlingMinutes };
  }

  @Put('patient-handling-thresholds')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  async updatePatientHandlingThresholds(@Body() dto: UpdatePatientHandlingThresholdsDto) {
    const error = validatePatientHandlingThresholds(dto);
    if (error) throw new BadRequestException(error);
    const { pickupHandlingMinutes, dropoffHandlingMinutes } = await this.settings.update(dto);
    return { pickupHandlingMinutes, dropoffHandlingMinutes };
  }

  @Get('occurrence-type-policies')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  occurrenceTypePolicies() {
    return this.policies.findAll();
  }

  @Patch('occurrence-type-policies/:occurrenceType')
  @Actions(Action.MANAGE_TRANSPORT_CONFIG)
  async updateOccurrenceTypePolicy(
    @Param('occurrenceType') occurrenceType: string,
    @Body() dto: UpdateOccurrenceTypePolicyDto,
  ) {
    if (!Object.values(TransportRequestOccurrenceType).includes(occurrenceType as TransportRequestOccurrenceType)) {
      throw new BadRequestException(`Unknown occurrence type ${occurrenceType}`);
    }
    const error = validateOccurrenceTypePolicy(dto);
    if (error) throw new BadRequestException(error);
    return this.policies.update(occurrenceType as TransportRequestOccurrenceType, dto);
  }
}
