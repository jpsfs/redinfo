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
import { FacilitiesService } from './facilities.service';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';

@ApiTags('Facilities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly facilities: FacilitiesService) {}

  /**
   * The emergency picker — active emergency destinations, nearest to
   * `localityId` first.
   *
   * Ungated: anyone who can file a report has to be able to say where they
   * took someone, and this route hands back nothing a coordinator would
   * withhold. Declared before `:id` so "emergency" is never read as an id.
   */
  @Get('emergency')
  @ApiQuery({ name: 'localityId', required: false, type: String })
  emergency(@Query('localityId') localityId?: string) {
    return this.facilities.findEmergencyDestinations(localityId);
  }

  /**
   * The transport picker — active transport destinations, nearest to
   * `localityId` first. Same ungating rationale as `emergency` above.
   */
  @Get('transport')
  @ApiQuery({ name: 'localityId', required: false, type: String })
  transport(@Query('localityId') localityId?: string) {
    return this.facilities.findTransportDestinations(localityId);
  }

  @Get()
  @Actions(Action.MANAGE_HOSPITALS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findManaged(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(100), ParseIntPipe) perPage: number,
    @Query('includeInactive', new DefaultValuePipe(true), ParseBoolPipe)
    includeInactive: boolean,
  ) {
    return this.facilities.findManaged(page, perPage, includeInactive);
  }

  @Get(':id')
  @Actions(Action.MANAGE_HOSPITALS)
  findOne(@Param('id') id: string) {
    return this.facilities.findOne(id);
  }

  @Post()
  @Actions(Action.MANAGE_HOSPITALS)
  create(@Body() dto: CreateFacilityDto) {
    return this.facilities.create(dto);
  }

  @Patch(':id')
  @Actions(Action.MANAGE_HOSPITALS)
  update(@Param('id') id: string, @Body() dto: UpdateFacilityDto) {
    return this.facilities.update(id, dto);
  }

  /**
   * Retires the facility. Only actually deletes the row when no report has
   * ever named it — see `FacilitiesService.remove`.
   */
  @Delete(':id')
  @Actions(Action.MANAGE_HOSPITALS)
  remove(@Param('id') id: string) {
    return this.facilities.remove(id);
  }
}
