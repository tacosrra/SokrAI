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
  });
});
