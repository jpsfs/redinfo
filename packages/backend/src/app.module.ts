import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { HealthModule } from './health/health.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { InventoryModule } from './inventory/inventory.module';
import { AvailabilityModule } from './availability/availability.module';
import { SchedulesModule } from './schedules/schedules.module';
import { GeographyModule } from './geography/geography.module';
import { HospitalsModule } from './hospitals/hospitals.module';
import { EventReportsModule } from './event-reports/event-reports.module';

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
    InventoryModule,
    AvailabilityModule,
    SchedulesModule,
    GeographyModule,
    HospitalsModule,
    EventReportsModule,
  ],
})
export class AppModule {}
