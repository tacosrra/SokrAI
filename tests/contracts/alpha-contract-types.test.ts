import { describe, expectTypeOf, it } from 'vitest';

import type {
  AlphaGap as ApiAlphaGap,
  AlphaProposal as ApiAlphaProposal,
  BasicAlphaReport as ApiBasicAlphaReport,
  ChatTurn as ApiChatTurn,
  GeneratedSection as ApiGeneratedSection,
  ModuleChat as ApiModuleChat,
  ProposalDocument as ApiProposalDocument,
  ProposalSource as ApiProposalSource,
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
  GeneratedSection as WebGeneratedSection,
  ModuleChat as WebModuleChat,
  ProposalDocument as WebProposalDocument,
  ProposalSource as WebProposalSource,
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
  });
});
