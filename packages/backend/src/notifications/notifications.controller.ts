import { Body, Controller, Delete, Get, Param, ParseEnumPipe, Post, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Action, NotificationType } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { NotificationsService } from './notifications.service';
import { RegisterPushSubscriptionDto } from './dto/register-push-subscription.dto';
import { UnregisterPushSubscriptionDto } from './dto/unregister-push-subscription.dto';
import { UpdateNotificationPreferencesDto } from './dto/update-notification-preferences.dto';
import { UpdateNotificationTypeSettingsDto } from './dto/update-notification-type-settings.dto';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Ungated: every authenticated user needs this to subscribe their own browser. */
  @Get('push/public-key')
  getPushPublicKey() {
    return this.notifications.getPushPublicKey();
  }

  /** Ungated, self-scoped — the same reason `POST /volunteer-hours` needs no action. */
  @Post('push/subscriptions')
  registerPushSubscription(@CurrentUser() user: { id: string }, @Body() dto: RegisterPushSubscriptionDto) {
    return this.notifications.registerPushSubscription(user.id, dto);
  }

  @Delete('push/subscriptions')
  unregisterPushSubscription(@CurrentUser() user: { id: string }, @Body() dto: UnregisterPushSubscriptionDto) {
    return this.notifications.unregisterPushSubscription(user.id, dto.endpoint);
  }

  /** The member's own notification settings, shown in their profile. */
  @Get('preferences')
  getMyPreferences(@CurrentUser() user: { id: string }) {
    return this.notifications.getMyPreferences(user.id);
  }

  @Put('preferences')
  updateMyPreferences(@CurrentUser() user: { id: string }, @Body() dto: UpdateNotificationPreferencesDto) {
    return this.notifications.updateMyPreferences(user.id, dto.preferences);
  }

  /** Org-wide default channels per notification type — the notification config page. */
  @Get('config/:type')
  @Actions(Action.MANAGE_NOTICES)
  getTypeSettings(@Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType) {
    return this.notifications.getTypeSettings(type);
  }

  @Put('config/:type')
  @Actions(Action.MANAGE_NOTICES)
  updateTypeSettings(
    @Param('type', new ParseEnumPipe(NotificationType)) type: NotificationType,
    @Body() dto: UpdateNotificationTypeSettingsDto,
  ) {
    return this.notifications.updateTypeSettings(type, dto.channels);
  }
}
