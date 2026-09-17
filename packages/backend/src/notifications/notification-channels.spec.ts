import { NotificationChannel, resolveEffectiveNotificationChannels } from '@redinfo/shared';

/**
 * The three-way precedence (notice choice ∩ org default ∩ user opt-out),
 * tested where it lives: in `@redinfo/shared`, so `NotificationDeliveryService`
 * and this test read the same sentence.
 */
describe('resolveEffectiveNotificationChannels', () => {
  const base = {
    requestedChannels: [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH],
    typeDefaultChannels: [NotificationChannel.EMAIL, NotificationChannel.WEB_PUSH],
    userDisabledChannels: [] as NotificationChannel[],
    userHasPushSubscription: true,
  };

  it('keeps a channel the notice requested, the org enables, and the user allows', () => {
    expect(resolveEffectiveNotificationChannels(base)).toEqual([
      NotificationChannel.EMAIL,
      NotificationChannel.WEB_PUSH,
    ]);
  });

  it('drops a channel the notice never requested, even if org and user both allow it', () => {
    const result = resolveEffectiveNotificationChannels({ ...base, requestedChannels: [NotificationChannel.EMAIL] });
    expect(result).toEqual([NotificationChannel.EMAIL]);
  });

  it('drops a channel the org has not enabled for this notification type', () => {
    const result = resolveEffectiveNotificationChannels({ ...base, typeDefaultChannels: [NotificationChannel.EMAIL] });
    expect(result).toEqual([NotificationChannel.EMAIL]);
  });

  it('drops a channel the user has explicitly turned off', () => {
    const result = resolveEffectiveNotificationChannels({
      ...base,
      userDisabledChannels: [NotificationChannel.WEB_PUSH],
    });
    expect(result).toEqual([NotificationChannel.EMAIL]);
  });

  it('drops WEB_PUSH when the user has no registered device, regardless of every other flag', () => {
    const result = resolveEffectiveNotificationChannels({ ...base, userHasPushSubscription: false });
    expect(result).toEqual([NotificationChannel.EMAIL]);
  });

  it('returns nothing when nothing was requested', () => {
    expect(resolveEffectiveNotificationChannels({ ...base, requestedChannels: [] })).toEqual([]);
  });
});
