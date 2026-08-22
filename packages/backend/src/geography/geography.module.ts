import { Module } from '@nestjs/common';
import { GeographyService } from './geography.service';
import { LocalitiesController, MunicipalitiesController } from './geography.controller';

@Module({
  providers: [GeographyService],
  controllers: [LocalitiesController, MunicipalitiesController],
  exports: [GeographyService],
})
export class GeographyModule {}
