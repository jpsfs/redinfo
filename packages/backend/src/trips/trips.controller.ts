import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Action } from '@redinfo/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Actions } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuditInterceptor } from '../auth/interceptors/audit.interceptor';
import { RequestUser } from '../patients/patients.service';
import { TripsService } from './trips.service';
import { TripCrewService } from './trip-crew.service';
import { TripStopsService } from './trip-stops.service';
import { TripBreakEvenService } from './trip-break-even.service';
import { TripCrewManifestService } from './trip-crew-manifest.service';
import { TripPlacementSuggestionsService } from './trip-placement-suggestions.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { UpdateTripDto } from './dto/update-trip.dto';
import { AddTripCrewMemberDto } from './dto/add-trip-crew-member.dto';
import { AssignTransportLegDto } from './dto/assign-transport-leg.dto';
import { CreateTripStopDto } from './dto/create-trip-stop.dto';
import { UpdateTripStopDto } from './dto/update-trip-stop.dto';
import { ReorderTripStopsDto } from './dto/reorder-trip-stops.dto';
import { SuggestPlacementsDto } from './dto/suggest-placements.dto';

/**
 * The model and API behind the planning board (#234) — the board itself is
 * #235. Every route is gated `PLAN_TRANSPORT_TRIPS` (#225): "build the day's
 * trips — assign legs to a vehicle and crew, sequence stops."
 */
@ApiTags('Trips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(AuditInterceptor)
@Controller('trips')
export class TripsController {
  constructor(
    private readonly trips: TripsService,
    private readonly crew: TripCrewService,
    private readonly stops: TripStopsService,
    private readonly breakEven: TripBreakEvenService,
    private readonly crewManifest: TripCrewManifestService,
    private readonly placementSuggestions: TripPlacementSuggestionsService,
  ) {}

  @Get()
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  @ApiQuery({ name: 'date', required: false, description: 'ISO date' })
  @ApiQuery({ name: 'vehicleId', required: false })
  list(@Query('date') date?: string, @Query('vehicleId') vehicleId?: string) {
    return this.trips.list({ date, vehicleId });
  }

  /** Every lane for `date` plus the legs still waiting to be dragged onto
   * one (#235) — `TransportPlanningPage`'s one call. Declared before `:id`
   * so `board` is never swallowed as an id. */
  @Get('board')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  @ApiQuery({ name: 'date', required: true, description: 'ISO date' })
  getBoard(@Query('date') date: string, @CurrentUser() user: RequestUser) {
    return this.trips.getBoard(date, user);
  }

  /** Everyone the crew dialog may offer for a journey on `date` (#235) —
   * flagged, never filtered, see `TripCrewService.listCandidates`. Declared
   * before `:id` so `crew-candidates` is never swallowed as an id. */
  @Get('crew-candidates')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  @ApiQuery({ name: 'date', required: true, description: 'ISO date' })
  getCrewCandidates(@Query('date') date: string) {
    return this.crew.listCandidates(date);
  }

  /** One vehicle's whole day (#247 stage 5) — the vehicle-day page, reached
   * from the board by clicking a vehicle's own icon. Declared before `:id`
   * for readability alongside `board`/`crew-candidates`, though it can't
   * actually collide: `:id` matches exactly one path segment. */
  @Get('vehicle/:vehicleId')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  @ApiQuery({ name: 'date', required: true, description: 'ISO date' })
  getVehicleDay(@Param('vehicleId') vehicleId: string, @Query('date') date: string, @CurrentUser() user: RequestUser) {
    return this.trips.getVehicleDay(vehicleId, date, user);
  }

  /**
   * A crew member's own manifest for `date` (#236) — `MyTransportTripsPage`'s
   * one call. Ungated on purpose, same reasoning as `SchedulesController
   * .getMyDuties`: scoped to the caller inside `TripCrewManifestService`, so
   * a crew member reads their own day without holding `PLAN_TRANSPORT_TRIPS`.
   * Declared before `:id` so `me` is never read as a trip id.
   */
  @Get('me')
  @ApiQuery({ name: 'date', required: true, description: 'ISO date' })
  getMyTrips(@Query('date') date: string, @CurrentUser() user: { id: string }) {
    return this.crewManifest.getMyTrips(user.id, date);
  }

  /** Seven per-date summaries starting at `from` (#247 stage 6) — the
   * planning board's week strip, so a heavy day is a Monday decision rather
   * than a Thursday-morning one. Declared before `:id` so `week` is never
   * read as a trip id. */
  @Get('week')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  @ApiQuery({ name: 'from', required: true, description: 'ISO date — the first of the seven days returned' })
  getWeek(@Query('from') from: string) {
    return this.trips.getWeek(from);
  }

  /** Planner-side counterpart to `GET /trips/me` (#247 stage 6) — a named
   * crew member's own manifest for `date`, for the week strip's crew-day
   * drill-down. Unlike `/me`, gated: the caller is reading someone else's
   * day, not their own, so identity degrades per the caller's own
   * `VIEW_PATIENT_IDENTITY` (see `TripCrewManifestService.getForCrewMember`).
   * Declared before `:id` so `crew` is never read as a trip id. */
  @Get('crew/:userId')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  @ApiQuery({ name: 'date', required: true, description: 'ISO date' })
  getCrewDay(@Param('userId') userId: string, @Query('date') date: string, @CurrentUser() user: RequestUser) {
    return this.crewManifest.getForCrewMember(userId, date, user);
  }

  /** One journey's own page (#247 stage 3) — vehicle, crew, ordered stops
   * with the legs they carry, issues, and a printable crew sheet. */
  @Get(':id')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  getDetail(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.trips.getDetail(id, user);
  }

  @Post()
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  create(@Body() dto: CreateTripDto) {
    return this.trips.create(dto);
  }

  /** Ranked candidate journeys for a group of unplanned legs (#247's
   * Suggestions stage) — see `TripPlacementSuggestionsService`. Ranking
   * only; applying a candidate is the same `POST /trips` +
   * `POST /trips/:id/legs` calls the board's own drag/dialog paths already
   * make. */
  @Post('suggest-placements')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  suggestPlacements(@Body() dto: SuggestPlacementsDto, @CurrentUser() user: RequestUser) {
    return this.placementSuggestions.suggest(dto.legIds, user);
  }

  @Patch(':id')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  update(@Param('id') id: string, @Body() dto: UpdateTripDto) {
    return this.trips.update(id, dto);
  }

  @Delete(':id')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  remove(@Param('id') id: string) {
    return this.trips.remove(id);
  }

  @Post(':id/crew')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  addCrewMember(@Param('id') tripId: string, @Body() dto: AddTripCrewMemberDto) {
    return this.crew.add(tripId, dto);
  }

  @Delete(':id/crew/:crewMemberId')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  removeCrewMember(@Param('id') tripId: string, @Param('crewMemberId') crewMemberId: string) {
    return this.crew.remove(tripId, crewMemberId);
  }

  /** Creates or moves the leg's `PICKUP`+`DROPOFF` pair onto this trip —
   * see `TripStopsService.assignLegToTrip`. */
  @Post(':id/legs')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  assignLeg(@Param('id') tripId: string, @Body() dto: AssignTransportLegDto) {
    return this.stops.assignLegToTrip(tripId, dto);
  }

  @Delete(':id/legs/:legId')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  unassignLeg(@Param('id') tripId: string, @Param('legId') legId: string) {
    return this.stops.unassignLeg(tripId, legId);
  }

  /** A `WAIT`/`RETURN_TO_BASE`/`DEPART_FROM_BASE` stop — see `TripStopsService.addStop`. */
  @Post(':id/stops')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  addStop(@Param('id') tripId: string, @Body() dto: CreateTripStopDto) {
    return this.stops.addStop(tripId, dto);
  }

  @Put(':id/stops/order')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  reorderStops(@Param('id') tripId: string, @Body() dto: ReorderTripStopsDto) {
    return this.stops.reorderStops(tripId, dto);
  }

  @Patch(':id/stops/:stopId')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  updateStop(@Param('id') tripId: string, @Param('stopId') stopId: string, @Body() dto: UpdateTripStopDto) {
    return this.stops.updateStop(tripId, stopId, dto);
  }

  @Delete(':id/stops/:stopId')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  deleteStop(@Param('id') tripId: string, @Param('stopId') stopId: string) {
    return this.stops.deleteStop(tripId, stopId);
  }

  /** Wait-vs-release as data — see `TripBreakEvenService`. */
  @Get(':id/stops/:stopId/break-even')
  @Actions(Action.PLAN_TRANSPORT_TRIPS)
  getBreakEven(@Param('id') tripId: string, @Param('stopId') stopId: string) {
    return this.breakEven.getBreakEven(tripId, stopId);
  }
}
