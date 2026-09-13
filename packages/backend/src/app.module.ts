import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { VehicleOccupancyModule } from './vehicle-occupancy/vehicle-occupancy.module';
import { InventoryModule } from './inventory/inventory.module';
import { AvailabilityModule } from './availability/availability.module';
import { SchedulesModule } from './schedules/schedules.module';
import { GeographyModule } from './geography/geography.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { EventReportsModule } from './event-reports/event-reports.module';
import { LiveRunsModule } from './live-runs/live-runs.module';
import { VolunteerHoursModule } from './volunteer-hours/volunteer-hours.module';
import { PaidStaffScheduleModule } from './paid-staff-schedule/paid-staff-schedule.module';
import { EmploymentContractsModule } from './employment-contracts/employment-contracts.module';
import { StaffAbsencesModule } from './staff-absences/staff-absences.module';
import { StatisticsModule } from './statistics/statistics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { NoticesModule } from './notices/notices.module';
import { InemModule } from './inem/inem.module';
import { OAuthModule } from './oauth/oauth.module';
import { McpModule } from './mcp/mcp.module';
import { PatientsModule } from './patients/patients.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    HealthModule,
    VehiclesModule,
    VehicleOccupancyModule,
    InventoryModule,
    AvailabilityModule,
    SchedulesModule,
    GeographyModule,
    FacilitiesModule,
    EventReportsModule,
    LiveRunsModule,
    VolunteerHoursModule,
    PaidStaffScheduleModule,
    EmploymentContractsModule,
    StaffAbsencesModule,
    StatisticsModule,
    NotificationsModule,
    NoticesModule,
    InemModule,
    OAuthModule,
    McpModule,
    PatientsModule,
  ],
})
export class AppModule {}
