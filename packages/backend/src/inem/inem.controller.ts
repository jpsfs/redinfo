import { Body, Controller, Get, HttpCode, Param, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Action, INEMStatusOverview } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { SetInemUnitStatusDto } from './dto/set-inem-unit-status.dto';
import { InemService } from './inem.service';

@ApiTags('INEM')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('inem')
export class InemController {
  constructor(private readonly inem: InemService) {}

  @Get('status')
  @Actions(Action.MANAGE_INEM_STATUS)
  getStatus(): Promise<INEMStatusOverview> {
    return this.inem.getStatusOverview();
  }

  @Put('units/:unitId')
  @Actions(Action.MANAGE_INEM_STATUS)
  @HttpCode(204)
  setUnitStatus(
    @CurrentUser() user: { id: string },
    @Param('unitId') unitId: string,
    @Body() dto: SetInemUnitStatusDto,
  ): Promise<void> {
    return this.inem.setUnitStatus(user, unitId, dto.inopCode);
  }
}
