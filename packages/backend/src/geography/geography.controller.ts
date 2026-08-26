import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { LOCALITY_SEARCH_LIMIT } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GeographyService } from './geography.service';

/**
 * The administrative map, readable by any signed-in user.
 *
 * Ungated on purpose: an operational filling in a report needs to look up the
 * locality they were called to, and where Cernache is has never been a secret.
 */
@ApiTags('Geography')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('localities')
export class LocalitiesController {
  constructor(private readonly geography: GeographyService) {}

  @Get()
  @ApiQuery({ name: 'q', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  search(
    @Query('q') q = '',
    @Query('limit', new DefaultValuePipe(LOCALITY_SEARCH_LIMIT), ParseIntPipe) limit: number,
  ) {
    return this.geography.searchLocalities(q, limit);
  }

  /**
   * Localities near a point — what the phone's "use my location" button asks
   * for. Declared before `:id` so "nearest" is never read as a locality id.
   */
  @Get('nearest')
  @ApiQuery({ name: 'lat', required: true, type: Number })
  @ApiQuery({ name: 'lon', required: true, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  nearest(
    @Query('lat') lat: string,
    @Query('lon') lon: string,
    @Query('limit', new DefaultValuePipe(LOCALITY_SEARCH_LIMIT), ParseIntPipe) limit: number,
  ) {
    return this.geography.nearestLocalities(Number(lat), Number(lon), limit);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.geography.findLocality(id);
  }
}

@ApiTags('Geography')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('municipalities')
export class MunicipalitiesController {
  constructor(private readonly geography: GeographyService) {}

  /**
   * Every municipality, wrapped like every other list endpoint so the admin
   * app's dataProvider — which reads `{ data, total }` — can use it as a
   * `<ReferenceInput>` source. Unpaged on purpose: 308 rows is cheap to hand
   * over whole, so `total` is just `data.length` rather than a real count.
   */
  @Get()
  async findAll() {
    const data = await this.geography.listMunicipalities();
    return { data, total: data.length };
  }
}
