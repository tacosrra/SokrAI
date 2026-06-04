import { assertRegulatoryProfile } from '../contracts/schema-registry';
import type { RegulatoryProfile, RegulatoryProfileId } from '../contracts/types';
import { AppError } from '../utils/errors';

export const HOSPITAL_CLINIC_V1_PROFILE: RegulatoryProfile = assertRegulatoryProfile({
  profile_id: 'hospital_clinic_v1',
  profile_version: 'v1',
  display_name: 'Hospital Clinic v1',
  families: [
    {
      family_id: 'gdpr',
      label: 'RGPD / GDPR',
      scope_note: 'Personal and health data protection context.',
    },
    {
      family_id: 'cybersecurity_act',
      label: 'Cybersecurity Act',
      scope_note: 'Cybersecurity and ICT certification context.',
    },
    {
      family_id: 'ehds',
      label: 'EEDS / EHDS',
      scope_note: 'European Health Data Space context.',
    },
    {
      family_id: 'mdr',
      label: 'MDR',
      scope_note: 'Medical Device Regulation uncertainty and question context only.',
    },
    {
      family_id: 'eu_ai_act',
      label: 'EU AI Act',
      scope_note: 'AI system governance and risk-context questions.',
    },
    {
      family_id: 'htar',
      label: 'HTAR',
      scope_note: 'Health Technology Assessment Regulation context.',
    },
  ],
  allowed_outputs: [
    'gaps',
    'questions',
    'uncertainty',
    'requires competent human review',
  ],
  forbidden_outputs: [
    'legal/regulatory/clinical/privacy/medical-device dictamen',
    'definitive compliance or non-compliance',
    'approval or rejection',
    'ranking, scoring, or prioritization',
    'definitive medical device classification',
    'replacement for competent human review',
  ],
  review_statement: 'requires competent human review',
});

export function getRegulatoryProfile(profileId: RegulatoryProfileId = 'hospital_clinic_v1'): RegulatoryProfile {
  if (profileId !== HOSPITAL_CLINIC_V1_PROFILE.profile_id) {
    throw new AppError(
      400,
      'unsupported_regulatory_profile',
      'The requested regulatory profile is not supported in the MVP',
      false,
    );
  }

  return HOSPITAL_CLINIC_V1_PROFILE;
}
