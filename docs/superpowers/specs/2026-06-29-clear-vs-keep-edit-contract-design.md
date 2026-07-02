# Clear-vs-keep contract for edit flows — design

**Date:** 2026-06-29
**Branch:** `fix/2026-06-29-clear-vs-keep-edit-contract`
**Status:** approved (design), pending implementation plan

## Problem

Two "cannot-unset" data bugs in the frontend edit flows: when an admin clears a
previously-set optional field and saves, the cleared value silently reverts.

The root cause is **structural**, present at three layers that each treat absence
as "keep":

1. **Frontend** omits empty fields from the PATCH payload (`if (trainingType) ...`,
   `if (trimmedDescription) ...`, hours only when `> 0`).
2. **`JSON.stringify`** (in `apiRequest`, `client.ts:69`) drops keys whose value is
   `undefined`.
3. **Backend service** guards every assignment with `if (request.X !== undefined)`.

Net effect: an omitted field is indistinguishable from "leave unchanged", so
clearing never reaches the database.

- **Bug A — course-version program meta** (`updateProgramMeta`, `mvp.service.ts:6069`):
  clearing academic hours / training type / study form / commission / regulatory-basis
  codes / OT-program codes on a DRAFT course version does not persist.
- **Bug B — commission description** (`updateCommission`, `mvp.service.ts:5934`):
  clearing an existing commission description does not persist.

## The contract

Distinguish **omit (keep)** from an **explicit clearing value**. The clearing value
is per-field-type, chosen so existing validation accepts it without ambiguity:

| Field type | Fields                                                                | Keep     | Clear (wire)                            |
| ---------- | --------------------------------------------------------------------- | -------- | --------------------------------------- |
| enum       | `trainingType`, `learnerCategory`, `studyForm`, `finalAssessmentForm` | omit key | `null`                                  |
| number     | `academicHours`                                                       | omit key | `null` (not `0` — `@Min(1)` rejects it) |
| FK string  | `commissionId`                                                        | omit key | `null`                                  |
| array      | `regulatoryBasisCodes`, `otProgramCodes`                              | omit key | `[]`                                    |
| free-text  | commission `description`                                              | omit key | `''`                                    |

`JSON.stringify` keeps `null`/`[]`/`''` on the wire and drops `undefined` — so
"send the clearing value vs. omit the key" survives serialization end-to-end.

## Design decisions

### D1 — Internal representation: normalize `null` → `undefined`; keep entity types `?: T`

For program-meta scalar/enum/FK fields, the service converts a received `null` to
`undefined` before assignment:

```ts
if (request.trainingType !== undefined) cv.trainingType = request.trainingType ?? undefined;
```

- Entity types (`CourseVersion`, `Commission`) stay `field?: T` — **no widening to `| null`**.
- Persistence is `JSON.stringify(entity)` (Postgres backend stores a JSON snapshot in a
  `data` column), which drops `undefined` keys → the clear round-trips as an absent key.
- The publish gate (`publishCourseVersion`) already uses `!cv.trainingType` / `== null`
  checks, so clearing a field on a draft then publishing is still correctly blocked.
- **Zero blast radius** on downstream readers (`pillar-a-variables` resolvers, document
  issuance, analytics).

**Rejected alternative:** widening entity types to `T | null`. Ripples `| null` through
every consumer of these fields for no functional benefit.

Free-text `description` is **not** normalized: wire value is `''` and the service stores
`''` directly (already works today), so `updateCommission` needs no change — Bug B is
frontend-only (see D3). Arrays persist as `[]` (a meaningful "no codes"), not `undefined`.

### D2 — DTO change is type-only, plus a `commissionId` guard

`class-validator`'s `@IsOptional()` already treats `null` as "missing" and **skips** the
inner validators (`@IsIn`, `@IsInt`, `@Min`), while still rejecting malformed non-null
input (`'bogus'`, `0`). So:

- DTO change = **widen the TS field types to `| null`** (e.g. `trainingType?: TrainingType | null`)
  so the service can legally read/assign `null`. No new decorators needed.
- `updateProgramMeta` commission existence check must change from `!== undefined` to
  `!= null` (skip lookup when `null` = detach), else clearing throws `commission_not_found`.

DTO-validation tests still assert the full matrix (null passes, garbage fails) to lock it.

### D3 — Bug B backend already works

`updateCommission` already does `if (request.description !== undefined) current.description = request.description`,
and the DTO `@IsString() @MaxLength(1000)` already accepts `''`. The only defect is the
frontend omission (`screens.tsx:2705`). Fix = frontend always sends `description` (even `''`)

- a service regression test.

### D4 — No `contracts:generate`

These MVP endpoints are **not** defined in `packages/api-contracts` (verified). The
"contracts" here are the hand-rolled DTOs + the frontend `ProgramMetaPatch` / `api.ts`
types. They are updated directly; no generation step.

### D5 — Frontend testability via pure-function extraction

`buildPayload` and the commission edit payload are closures inside components, and the
repo has no React Testing Library. Extract the clear-vs-keep mapping into pure exported
functions so it is unit-testable per the repo's pure-function convention:

- `buildProgramMetaPatch(formState) -> ProgramMetaPatch`
- `buildCommissionInfoPayload(name, description) -> { name; description }`

## Safety invariant (the "always send" requirement)

Both forms are **edit forms that pre-populate** current values, so "always send every
field" round-trips untouched fields unchanged:

- Program-meta form initializes state from `courseVersion` via `useState` + `useEffect`
  resync (`screens.tsx:867-901`).
- Commission form initializes via `setEditDescription(data.description ?? '')` (`screens.tsx:2683`).

The program-meta form does **not** expose `recertificationPeriodMonths` /
`programAttachmentFileId`, so `buildProgramMetaPatch` omits them → they stay kept. Correct.

## Affected files

- `apps/backend/src/modules/mvp/mvp.dto.ts` — widen `UpdateProgramMetaRequest` scalar/enum/FK fields to `| null`.
- `apps/backend/src/modules/mvp/mvp.service.ts` — `updateProgramMeta` normalize + `commissionId` `!= null` guard.
- `apps/frontend/src/features/mvp/types.ts` — widen `ProgramMetaPatch` scalar/enum/FK fields to `| null`.
- `apps/frontend/src/features/mvp/screens.tsx` — call extracted builders; always send.
- `apps/frontend/src/features/mvp/payloads.ts` (new) — pure builder functions.

## Test plan (TDD — tests first)

- **DTO-validation** (`mvp.update-program-meta.dto-validation.test.ts`, new):
  `UpdateProgramMetaRequest` accepts `null` for each scalar/enum/FK field and `[]` for arrays;
  rejects `trainingType:'bogus'`, `academicHours:0`.
- **Service** (extend `mvp.service.test.ts`):
  - `updateProgramMeta({trainingType:null})` clears it (becomes `undefined`).
  - `updateProgramMeta({commissionId:null})` detaches without throwing.
  - `updateProgramMeta({regulatoryBasisCodes:[]})` clears.
  - omitted field is kept; full payload with one cleared field leaves the rest intact.
  - `updateCommission({description:''})` clears (regression for Bug B).
- **Frontend** (`payloads.test.ts`, new):
  - `buildProgramMetaPatch` emits `null`/`[]` for emptied fields, real values otherwise.
  - `buildCommissionInfoPayload('x','')` emits `description:''`.

## Out of scope

- Widening entity types to `| null` (D1 rejected alternative).
- Any change to `recertificationPeriodMonths` / `programAttachmentFileId` UX.
- Contract generation (D4).
