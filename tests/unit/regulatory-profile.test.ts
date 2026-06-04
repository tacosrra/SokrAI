import { describe, expect, it } from 'vitest';

import { assertRegulatoryProfile } from '../../apps/api/src/contracts/schema-registry.ts';
import { HOSPITAL_CLINIC_V1_PROFILE, getRegulatoryProfile } from '../../apps/api/src/domain/regulatory-profile.ts';
import { AppError } from '../../apps/api/src/utils/errors.ts';

describe('regulatory profile domain rules', () => {
  it('exposes hospital_clinic_v1 with the six fixed MVP families', () => {
    const profile = getRegulatoryProfile();

    expect(profile.profile_id).toBe('hospital_clinic_v1');
    expect(profile.families.map((family) => family.family_id)).toEqual([
      'gdpr',
      'cybersecurity_act',
      'ehds',
      'mdr',
      'eu_ai_act',
      'htar',
    ]);
    expect(profile.allowed_outputs).toContain('gaps');
    expect(profile.allowed_outputs).toContain('questions');
    expect(profile.allowed_outputs).toContain('uncertainty');
    expect(profile.review_statement).toBe('requires competent human review');
    expect(profile.forbidden_outputs.join(' ')).toMatch(/definitive medical device classification/i);
  });

  it('validates the static profile against its JSON schema', () => {
    expect(assertRegulatoryProfile(HOSPITAL_CLINIC_V1_PROFILE)).toBe(HOSPITAL_CLINIC_V1_PROFILE);
  });

  it('rejects unsupported profile ids in v1', () => {
    expect(() => getRegulatoryProfile('other_profile' as never)).toThrow(AppError);
  });
});
