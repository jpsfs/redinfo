import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateProfileDto } from './update-profile.dto';

/**
 * The one field on this DTO whose validity actually matters for #180: a typo
 * or a stray region tag (`'pt-PT'`, `'PT'`) must not reach `User.locale`, or
 * `messagesFor()` silently falls back to the raw key for every string in the
 * app rather than failing where the mistake was made.
 */
describe('UpdateProfileDto — locale', () => {
  it('accepts pt and en', async () => {
    for (const locale of ['pt', 'en']) {
      const dto = plainToInstance(UpdateProfileDto, { locale });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    }
  });

  it('rejects anything else, including a region-tagged or uppercase variant', async () => {
    for (const locale of ['pt-PT', 'PT', 'fr', '']) {
      const dto = plainToInstance(UpdateProfileDto, { locale });
      const errors = await validate(dto);
      expect(errors).not.toHaveLength(0);
    }
  });

  it('is optional — omitting it is not a validation error', async () => {
    const dto = plainToInstance(UpdateProfileDto, { phone: '912345678' });
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });
});
