# Product brief

## Product definition

Build a system that matures research and innovation project proposals before committee evaluation.

The system acts as middleware between:
- the proposing team, and
- the evaluating committee.

It should improve:
- completeness,
- clarity,
- comparability,
- traceability,
- and readiness for evaluation.

It must **not** be framed as replacing the committee or automating the final approval decision.

## Operating model

The product is a structured conversational system, not a generic chatbot.

Core layers:
1. conversational guidance
2. maturity assessment
3. domain/context specialization
4. output generation
5. persistence and auditability

## Target MVP context

The first domain pack is **HealthGenAI**.

That means the long-term product should eventually account for:
- sensitive data
- governance and privacy
- on-prem or controlled deployment
- monitoring and human supervision
- hallucination risk
- cost of inference
- contextual knowledge quality

## Initial v1 objective

The first functional version should prove one thing well:

> given an initial project proposal, the system can extract a structured brief and guide the user through a focused conversation that leaves the problem much better defined than it was initially.

## What v1 should fully implement

- intake of initial proposal text and optionally document text
- normalization
- structured brief extraction
- stateful conversation
- one active lane: problem definition
- persistence
- audit trail
- repeatable contracts
- local run path

## What v1 can defer

- full legal screening
- full cost estimation
- broad multi-agent orchestration
- committee scoring/prioritization
- advanced RAG
- production-grade enterprise integration

## Strategic future direction

Once the problem-definition path is solid, the architecture should be ready to expand with:
- legal screening
- architecture/resources lane
- cost lane
- dossier builder
- domain packs beyond HealthGenAI
