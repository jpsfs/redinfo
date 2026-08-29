import { Counters } from './counters';

describe('Counters', () => {
  it('starts every entity at zero without needing an explicit register step', () => {
    const counters = new Counters();
    expect(counters.get('User')).toEqual({ created: 0, adopted: 0, updated: 0, unchanged: 0, rejected: 0 });
  });

  it('records outcomes per entity independently', () => {
    const counters = new Counters();
    counters.record('User', 'created');
    counters.record('User', 'created');
    counters.record('Vehicle', 'adopted');
    expect(counters.get('User')).toMatchObject({ created: 2 });
    expect(counters.get('Vehicle')).toMatchObject({ adopted: 1 });
  });

  it('totalUpdated sums the updated count across every entity', () => {
    const counters = new Counters();
    counters.record('User', 'updated');
    counters.record('User', 'updated');
    counters.record('Vehicle', 'updated');
    counters.record('Vehicle', 'created');
    expect(counters.totalUpdated()).toBe(3);
  });

  it('totalRejected sums rejections across every entity', () => {
    const counters = new Counters();
    counters.reject('EventReport');
    counters.reject('EventReport');
    counters.reject('User');
    expect(counters.totalRejected()).toBe(3);
  });

  it('entities() lists every entity touched so far', () => {
    const counters = new Counters();
    counters.record('User', 'created');
    counters.reject('Vehicle');
    expect(counters.entities().sort()).toEqual(['User', 'Vehicle']);
  });
});
