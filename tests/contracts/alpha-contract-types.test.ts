import { describe, expectTypeOf, it } from 'vitest';

import type {
  AlphaGap as ApiAlphaGap,
  AlphaProposal as ApiAlphaProposal,
  BasicAlphaReport as ApiBasicAlphaReport,
  ChatTurn as ApiChatTurn,
  DataAiPrivacyReplyRequest as ApiDataAiPrivacyReplyRequest,
  DataAiPrivacyReplyResponse as ApiDataAiPrivacyReplyResponse,
  DataAiPrivacyStartRequest as ApiDataAiPrivacyStartRequest,
  DataAiPrivacyStartResponse as ApiDataAiPrivacyStartResponse,
  DataAiPrivacyState as ApiDataAiPrivacyState,
  GeneratedSection as ApiGeneratedSection,
  MedicalDeviceTriageReplyRequest as ApiMedicalDeviceTriageReplyRequest,
  MedicalDeviceTriageReplyResponse as ApiMedicalDeviceTriageReplyResponse,
  MedicalDeviceTriageStartRequest as ApiMedicalDeviceTriageStartRequest,
  MedicalDeviceTriageStartResponse as ApiMedicalDeviceTriageStartResponse,
  MedicalDeviceTriageState as ApiMedicalDeviceTriageState,
  ModuleChat as ApiModuleChat,
  ProposalDocument as ApiProposalDocument,
  ProposalSource as ApiProposalSource,
  ResourcesPilotViabilityReplyRequest as ApiResourcesPilotViabilityReplyRequest,
  ResourcesPilotViabilityReplyResponse as ApiResourcesPilotViabilityReplyResponse,
  ResourcesPilotViabilityStartRequest as ApiResourcesPilotViabilityStartRequest,
  ResourcesPilotViabilityStartResponse as ApiResourcesPilotViabilityStartResponse,
  ResourcesPilotViabilityState as ApiResourcesPilotViabilityState,
  SolutionDefinitionState as ApiSolutionDefinitionState,
  SolutionReplyRequest as ApiSolutionReplyRequest,
  SolutionReplyResponse as ApiSolutionReplyResponse,
  SolutionStartRequest as ApiSolutionStartRequest,
  SolutionStartResponse as ApiSolutionStartResponse,
} from '../../apps/api/src/contracts/types.ts';
import type {
  AlphaGap as WebAlphaGap,
  AlphaProposal as WebAlphaProposal,
  BasicAlphaReport as WebBasicAlphaReport,
  ChatTurn as WebChatTurn,
  DataAiPrivacyReplyRequest as WebDataAiPrivacyReplyRequest,
  DataAiPrivacyReplyResponse as WebDataAiPrivacyReplyResponse,
  DataAiPrivacyStartRequest as WebDataAiPrivacyStartRequest,
  DataAiPrivacyStartResponse as WebDataAiPrivacyStartResponse,
  DataAiPrivacyState as WebDataAiPrivacyState,
  GeneratedSection as WebGeneratedSection,
  MedicalDeviceTriageReplyRequest as WebMedicalDeviceTriageReplyRequest,
  MedicalDeviceTriageReplyResponse as WebMedicalDeviceTriageReplyResponse,
  MedicalDeviceTriageStartRequest as WebMedicalDeviceTriageStartRequest,
  MedicalDeviceTriageStartResponse as WebMedicalDeviceTriageStartResponse,
  MedicalDeviceTriageState as WebMedicalDeviceTriageState,
  ModuleChat as WebModuleChat,
  ProposalDocument as WebProposalDocument,
  ProposalSource as WebProposalSource,
  ResourcesPilotViabilityReplyRequest as WebResourcesPilotViabilityReplyRequest,
  ResourcesPilotViabilityReplyResponse as WebResourcesPilotViabilityReplyResponse,
  ResourcesPilotViabilityStartRequest as WebResourcesPilotViabilityStartRequest,
  ResourcesPilotViabilityStartResponse as WebResourcesPilotViabilityStartResponse,
  ResourcesPilotViabilityState as WebResourcesPilotViabilityState,
  SolutionDefinitionState as WebSolutionDefinitionState,
  SolutionReplyRequest as WebSolutionReplyRequest,
  SolutionReplyResponse as WebSolutionReplyResponse,
  SolutionStartRequest as WebSolutionStartRequest,
  SolutionStartResponse as WebSolutionStartResponse,
} from '../../apps/web/src/domain/contracts.ts';

describe('Alpha contract type mirrors', () => {
  it('keeps API and web Alpha DTOs structurally identical', () => {
    expectTypeOf<ApiProposalSource>().toEqualTypeOf<WebProposalSource>();
    expectTypeOf<ApiProposalDocument>().toEqualTypeOf<WebProposalDocument>();
    expectTypeOf<ApiAlphaGap>().toEqualTypeOf<WebAlphaGap>();
    expectTypeOf<ApiChatTurn>().toEqualTypeOf<WebChatTurn>();
    expectTypeOf<ApiModuleChat>().toEqualTypeOf<WebModuleChat>();
    expectTypeOf<ApiGeneratedSection>().toEqualTypeOf<WebGeneratedSection>();
    expectTypeOf<ApiAlphaProposal>().toEqualTypeOf<WebAlphaProposal>();
    expectTypeOf<ApiBasicAlphaReport>().toEqualTypeOf<WebBasicAlphaReport>();
    expectTypeOf<ApiSolutionDefinitionState>().toEqualTypeOf<WebSolutionDefinitionState>();
    expectTypeOf<ApiSolutionStartRequest>().toEqualTypeOf<WebSolutionStartRequest>();
    expectTypeOf<ApiSolutionStartResponse>().toEqualTypeOf<WebSolutionStartResponse>();
    expectTypeOf<ApiSolutionReplyRequest>().toEqualTypeOf<WebSolutionReplyRequest>();
    expectTypeOf<ApiSolutionReplyResponse>().toEqualTypeOf<WebSolutionReplyResponse>();
    expectTypeOf<ApiDataAiPrivacyState>().toEqualTypeOf<WebDataAiPrivacyState>();
    expectTypeOf<ApiDataAiPrivacyStartRequest>().toEqualTypeOf<WebDataAiPrivacyStartRequest>();
    expectTypeOf<ApiDataAiPrivacyStartResponse>().toEqualTypeOf<WebDataAiPrivacyStartResponse>();
    expectTypeOf<ApiDataAiPrivacyReplyRequest>().toEqualTypeOf<WebDataAiPrivacyReplyRequest>();
    expectTypeOf<ApiDataAiPrivacyReplyResponse>().toEqualTypeOf<WebDataAiPrivacyReplyResponse>();
    expectTypeOf<ApiMedicalDeviceTriageState>().toEqualTypeOf<WebMedicalDeviceTriageState>();
    expectTypeOf<ApiMedicalDeviceTriageStartRequest>().toEqualTypeOf<WebMedicalDeviceTriageStartRequest>();
    expectTypeOf<ApiMedicalDeviceTriageStartResponse>().toEqualTypeOf<WebMedicalDeviceTriageStartResponse>();
    expectTypeOf<ApiMedicalDeviceTriageReplyRequest>().toEqualTypeOf<WebMedicalDeviceTriageReplyRequest>();
    expectTypeOf<ApiMedicalDeviceTriageReplyResponse>().toEqualTypeOf<WebMedicalDeviceTriageReplyResponse>();
    expectTypeOf<ApiResourcesPilotViabilityState>().toEqualTypeOf<WebResourcesPilotViabilityState>();
    expectTypeOf<ApiResourcesPilotViabilityStartRequest>().toEqualTypeOf<WebResourcesPilotViabilityStartRequest>();
    expectTypeOf<ApiResourcesPilotViabilityStartResponse>().toEqualTypeOf<WebResourcesPilotViabilityStartResponse>();
    expectTypeOf<ApiResourcesPilotViabilityReplyRequest>().toEqualTypeOf<WebResourcesPilotViabilityReplyRequest>();
    expectTypeOf<ApiResourcesPilotViabilityReplyResponse>().toEqualTypeOf<WebResourcesPilotViabilityReplyResponse>();
  });
});
