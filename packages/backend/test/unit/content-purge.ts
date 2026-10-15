import assert from "node:assert/strict";

import { ContentPurgeProvider as P } from "../../src/providers/maintenance/ContentPurgeProvider";

const target: P.RetentionInventoryTarget = {
  kind: "record_comment",
  id: "2c796cf6-68c4-4d43-a62d-2fd810bde6ba",
  deletion_operation_id: "57944203-a330-42cf-a9d2-6cd2d0f63f3c",
  deleted_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const now = new Date("2026-03-01T00:00:00.000Z");
const evidence: P.RetentionInventoryEvidence = {
  ...target,
  inventory_id: "isolated-test-inventory",
  scanned_at: "2026-02-28T23:59:00.000Z",
  covers_through: "2026-03-01T00:01:00.000Z",
  retain_until: "2026-02-28T00:00:00.000Z",
  no_backup_references: true,
  no_retained_references: true,
};

assert.doesNotThrow(() => P.validateDeletionAge(target.deleted_at, now));
assert.throws(() => P.validateDeletionAge("2026-02-01T00:00:00.000Z", now));
assert.throws(() => P.validateDeletionAge("2026-03-02T00:00:00.000Z", now));
assert.doesNotThrow(() => P.validateInventoryEvidence(target, evidence, now));
assert.throws(() => P.validateInventoryEvidence(target, undefined, now));
assert.throws(() => P.validateInventoryEvidence(target, { ...evidence, id: "00000000-0000-4000-8000-000000000000" }, now));
assert.throws(() => P.validateInventoryEvidence(target, { ...evidence, scanned_at: "2026-02-01T00:00:00.000Z" }, now));
assert.throws(() => P.validateInventoryEvidence(target, { ...evidence, covers_through: "2026-02-28T23:59:00.000Z" }, now));
assert.throws(() => P.validateInventoryEvidence(target, { ...evidence, retain_until: "2026-03-02T00:00:00.000Z" }, now));
assert.throws(() => P.validateInventoryEvidence(target, { ...evidence, no_backup_references: false } as unknown as P.RetentionInventoryEvidence, now));
assert.throws(() => P.validateInventoryEvidence(target, { ...evidence, scanned_at: new Date("2026-02-28T23:59:00.000Z") } as unknown as P.RetentionInventoryEvidence, now));
assert.throws(() => P.validateInventoryEvidence(target, { ...evidence, inventory_id: "bad", extra: true } as P.RetentionInventoryEvidence, now));

console.log("PASS content purge age, exact-target inventory, freshness, retention and serializable evidence checks");
