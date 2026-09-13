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
import { CreateTransportRequestDto } from './dto/create-transport-request.dto';
import { UpdateTransportRequestDto } from './dto/update-transport-request.dto';
import { DecideTransportRequestDto } from './dto/decide-transport-request.dto';

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
  constructor(private readonly transportRequests: TransportRequestsService) {}

  @Get()
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'perPage', required: false, type: Number })
  @ApiQuery({ name: 'decision', required: false, enum: TransportRequestDecision })
  findManaged(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('perPage', new DefaultValuePipe(50), ParseIntPipe) perPage: number,
    @Query('decision') decision?: TransportRequestDecision,
  ) {
    return this.transportRequests.findManaged(page, perPage, decision);
  }

  @Get(':id')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  findOne(@Param('id') id: string) {
    return this.transportRequests.findOne(id);
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

  @Delete(':id')
  @Actions(Action.MANAGE_TRANSPORT_REQUESTS)
  remove(@Param('id') id: string) {
    return this.transportRequests.remove(id);
  }
}
