import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Action } from '@redinfo/shared';
import { EmploymentContractsService } from './employment-contracts.service';
import { CreateEmploymentContractDto } from './dto/create-contract.dto';
import { EndEmploymentContractDto } from './dto/end-contract.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { RequestUser } from '../users/users.controller';

/**
 * Employment contracts (Stage 1 of the paid-staff rework). Writes are
 * `MANAGE_PERSONNEL` only — same split as `PaidStaffScheduleController`:
 * this is a coordinator's record of a contract, not something a person
 * edits about themselves. Reading one's own needs no `Action`, the same way
 * `GET /schedules/me` doesn't: it's you.
 */
@ApiTags('Employment contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('employment-contracts')
export class EmploymentContractsController {
  constructor(private readonly contracts: EmploymentContractsService) {}

  @Get('me')
  getMine(@CurrentUser() user: RequestUser) {
    return this.contracts.list(user.id);
  }

  @Get(':userId')
  @Actions(Action.MANAGE_PERSONNEL)
  list(@Param('userId') userId: string) {
    return this.contracts.list(userId);
  }

  @Post(':userId')
  @Actions(Action.MANAGE_PERSONNEL)
  create(
    @Param('userId') userId: string,
    @Body() dto: CreateEmploymentContractDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.contracts.create(userId, dto, user.id);
  }

  @Patch(':userId/:contractId')
  @Actions(Action.MANAGE_PERSONNEL)
  end(
    @Param('userId') userId: string,
    @Param('contractId') contractId: string,
    @Body() dto: EndEmploymentContractDto,
  ) {
    return this.contracts.end(userId, contractId, dto);
  }

  @Delete(':userId/:contractId')
  @Actions(Action.MANAGE_PERSONNEL)
  remove(@Param('userId') userId: string, @Param('contractId') contractId: string) {
    return this.contracts.remove(userId, contractId);
  }
}
