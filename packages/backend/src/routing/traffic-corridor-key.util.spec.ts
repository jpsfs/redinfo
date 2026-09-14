import { corridorKeyFor } from './traffic-corridor-key.util';

describe('corridorKeyFor', () => {
  it('distinguishes a locality endpoint from a facility endpoint with the same id', () => {
    const locality = corridorKeyFor({ kind: 'locality', localityId: 'x1' }, { kind: 'facility', facilityId: 'y1' });
    const facility = corridorKeyFor({ kind: 'facility', facilityId: 'x1' }, { kind: 'facility', facilityId: 'y1' });

    expect(locality).not.toBe(facility);
  });

  it('is directional — swapping origin and destination changes the key', () => {
    const a = corridorKeyFor({ kind: 'locality', localityId: 'x1' }, { kind: 'facility', facilityId: 'y1' });
    const b = corridorKeyFor({ kind: 'facility', facilityId: 'y1' }, { kind: 'locality', localityId: 'x1' });

    expect(a).not.toBe(b);
  });

  it('is stable for the same corridor', () => {
    const first = corridorKeyFor({ kind: 'locality', localityId: 'x1' }, { kind: 'facility', facilityId: 'y1' });
    const second = corridorKeyFor({ kind: 'locality', localityId: 'x1' }, { kind: 'facility', facilityId: 'y1' });

    expect(first).toBe(second);
  });
});
