import { assertInternalRoutingHost } from './routing-host-guard';

describe('assertInternalRoutingHost', () => {
  it('accepts the compose-network service hosts', () => {
    expect(() => assertInternalRoutingHost('http://osrm:5000', 'ROUTING_BASE_URL')).not.toThrow();
    expect(() =>
      assertInternalRoutingHost('http://nominatim:8080', 'GEOCODING_BASE_URL'),
    ).not.toThrow();
  });

  it('accepts loopback, for a backend run outside Docker', () => {
    expect(() =>
      assertInternalRoutingHost('http://localhost:5000', 'ROUTING_BASE_URL'),
    ).not.toThrow();
    expect(() =>
      assertInternalRoutingHost('http://127.0.0.1:8080', 'GEOCODING_BASE_URL'),
    ).not.toThrow();
  });

  it('rejects a real external routing host', () => {
    expect(() =>
      assertInternalRoutingHost('https://router.project-osrm.org', 'ROUTING_BASE_URL'),
    ).toThrow(/external host/);
  });

  it('rejects a real external geocoding host', () => {
    expect(() =>
      assertInternalRoutingHost('https://nominatim.openstreetmap.org', 'GEOCODING_BASE_URL'),
    ).toThrow(/external host/);
  });

  it('rejects a value that is not a URL at all', () => {
    expect(() => assertInternalRoutingHost('not-a-url', 'ROUTING_BASE_URL')).toThrow(
      /not a valid URL/,
    );
  });
});
