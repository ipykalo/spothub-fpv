import { publicName } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { readPilotNameDraft } from './pilot-name-draft';

describe('publicName', () => {
  it('prefers the name the pilot chose', () => {
    expect(publicName('Sky Ninja', 'Ivan Pykalo')).toBe('Sky Ninja');
  });

  it('cuts a full name to the first name and the last name’s initial', () => {
    expect(publicName(null, 'Ivan Pykalo')).toBe('Ivan P.');
    expect(publicName(null, '  Anna  Maria   de la Cruz ')).toBe('Anna C.');
    expect(publicName(null, 'ivan ølsen')).toBe('ivan Ø.');
  });

  it('keeps a one-word name as it is, and has nothing to show for none', () => {
    expect(publicName(null, 'Ivan')).toBe('Ivan');
    expect(publicName(null, null)).toBeNull();
    expect(publicName('   ', '   ')).toBeNull();
  });
});

describe('readPilotNameDraft', () => {
  it('reads an empty field as going back to the short form', () => {
    expect(readPilotNameDraft('  ', 'Ivan Pykalo')).toEqual({
      value: null,
      error: null,
      preview: 'Ivan P.',
    });
  });

  it('trims a valid name and previews it as others will see it', () => {
    expect(readPilotNameDraft('  Sky_Ninja-7 ', 'Ivan Pykalo')).toEqual({
      value: 'Sky_Ninja-7',
      error: null,
      preview: 'Sky_Ninja-7',
    });
  });

  it('says what is wrong with a name the API would refuse', () => {
    expect(readPilotNameDraft('x', null).error).toBe('At least 2 characters');
    expect(readPilotNameDraft('<script>', null).error).toContain('Letters, digits');
    expect(readPilotNameDraft('www.evil.com/x', null).error).toContain('Letters, digits');
    expect(readPilotNameDraft('a'.repeat(33), null).error).toBe('At most 32 characters');
  });

  it('accepts names in any alphabet', () => {
    expect(readPilotNameDraft('Іван', null).value).toBe('Іван');
  });
});
