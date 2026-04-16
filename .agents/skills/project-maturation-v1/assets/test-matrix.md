# Test matrix for the first MVP

## 1. Vague proposal
Input:
- brief idea with generic benefits
Expected:
- structured brief contains many missing fields
- first question asks to identify the affected actor and real problem

## 2. Solution masquerading as a problem
Input:
- proposal framed mainly as "we want to build X"
Expected:
- diagnosis flags solution-first framing
- next question asks about the underlying pain/problem

## 3. Technically detailed but problem-poor
Input:
- architecture-heavy submission with little justification
Expected:
- extraction captures technical context
- problem-definition question redirects to impact/evidence

## 4. Strong proposal
Input:
- clear actor, pain, impact, evidence, alternatives, and scope
Expected:
- fewer missing items
- agent may need only one or two clarifications before `done`

## 5. Low-information user follow-up
Input:
- reply such as "no lo sé" or "depende"
Expected:
- reformulated narrower question
- no stage advancement

## 6. Invalid model JSON
Simulate:
- malformed model output
Expected:
- repair prompt is attempted once
- if repair works, flow continues
- if repair fails, controlled error + raw output persisted

## 7. Unknown session reply
Input:
- reply with non-existent session id
Expected:
- controlled error response
- no new session created

## 8. Empty submission
Input:
- no proposal_text and no document_text
Expected:
- validation error before workflow progression
