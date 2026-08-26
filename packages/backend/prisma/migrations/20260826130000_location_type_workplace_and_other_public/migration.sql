-- Two more values for a report's location type: a public location that isn't
-- already one of "road" or "public space", and a workplace.
--
-- No CHECK/trigger is added for the companion rule in this same work item
-- (an emergency victim may no longer be "treated on scene"): the victim table
-- carries no report type of its own, and a CHECK could not express "valid on
-- some report types, not on others" without a trigger — and would reject the
-- historical emergency rows the change deliberately leaves alone. That rule
-- lives in `validateVictimDestination` (packages/shared) instead, enforced on
-- every create/update by the service layer.
ALTER TYPE "EventLocationType" ADD VALUE 'OTHER_PUBLIC_LOCATION';
ALTER TYPE "EventLocationType" ADD VALUE 'WORK_PLACE';
