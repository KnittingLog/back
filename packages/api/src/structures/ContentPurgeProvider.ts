import type { tags } from "typia";

export namespace ContentPurgeProvider {
  export type PrepareInput = {
    operation_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    deletion_operation_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    targets: ContentPurgeProvider.Target[] &
      tags.TagBase<{
        target: "array";
        kind: "minItems";
        value: 1;
        validate: "1 <= $input.length";
        exclusive: true;
        schema: {
          minItems: 1;
        };
      }> &
      tags.TagBase<{
        target: "array";
        kind: "maxItems";
        value: 100;
        validate: "$input.length <= 100";
        exclusive: true;
        schema: {
          maxItems: 100;
        };
      }>;
    executor_user_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    reason: string &
      tags.TagBase<{
        target: "string";
        kind: "minLength";
        value: 1;
        validate: '1 <= $importInternal("_stringLength")($input)';
        exclusive: true;
        schema: {
          minLength: 1;
        };
      }> &
      tags.TagBase<{
        target: "string";
        kind: "maxLength";
        value: 1000;
        validate: '$importInternal("_stringLength")($input) <= 1000';
        exclusive: true;
        schema: {
          maxLength: 1000;
        };
      }>;
    expires_at: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "date-time";
        validate: '$importInternal("isFormatDateTime")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "date-time";
        };
      }>;
  };
  export type Target = {
    kind:
      | "counter"
      | "post"
      | "post_comment"
      | "project"
      | "record"
      | "record_comment"
      | "workspace";
    id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
  };
  export type Preview = {
    target: ContentPurgeProvider.Target;
    deletion_operation_id: string;
    deleted_at: string;
    updated_at: string;
    owner_user_ids: string[];
    parent: null | ContentPurgeProvider.ParentSnapshot;
    version: null | number;
    workspace_version: null | number;
    dependencies: ContentPurgeProvider.DependencySnapshot[];
    inventory_id: string;
    inventory_scanned_at: string;
    inventory_covers_through: string;
    retain_until: string;
  };
  export type ParentSnapshot = {
    kind: "post" | "project" | "record" | "workspace";
    id: string;
    updated_at: string;
    deleted_at: null | string;
    owner_user_id: string;
    project_id: null | string;
    version: null | number;
  };
  export type DependencySnapshot = {
    kind:
      | "counter"
      | "invitation"
      | "like"
      | "membership"
      | "post_comment"
      | "reaction"
      | "record"
      | "record_comment"
      | "report"
      | "timer"
      | "transfer"
      | "workspace";
    ids: string[];
  };
  export type ApproveInput = {
    operation_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    deletion_operation_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    targets: ContentPurgeProvider.Target[] &
      tags.TagBase<{
        target: "array";
        kind: "minItems";
        value: 1;
        validate: "1 <= $input.length";
        exclusive: true;
        schema: {
          minItems: 1;
        };
      }> &
      tags.TagBase<{
        target: "array";
        kind: "maxItems";
        value: 100;
        validate: "$input.length <= 100";
        exclusive: true;
        schema: {
          maxItems: 100;
        };
      }>;
    executor_user_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    reason: string &
      tags.TagBase<{
        target: "string";
        kind: "minLength";
        value: 1;
        validate: '1 <= $importInternal("_stringLength")($input)';
        exclusive: true;
        schema: {
          minLength: 1;
        };
      }> &
      tags.TagBase<{
        target: "string";
        kind: "maxLength";
        value: 1000;
        validate: '$importInternal("_stringLength")($input) <= 1000';
        exclusive: true;
        schema: {
          maxLength: 1000;
        };
      }>;
    expires_at: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "date-time";
        validate: '$importInternal("isFormatDateTime")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "date-time";
        };
      }>;
    approval_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    expected_snapshots: ContentPurgeProvider.Preview[] &
      tags.TagBase<{
        target: "array";
        kind: "minItems";
        value: 1;
        validate: "1 <= $input.length";
        exclusive: true;
        schema: {
          minItems: 1;
        };
      }> &
      tags.TagBase<{
        target: "array";
        kind: "maxItems";
        value: 100;
        validate: "$input.length <= 100";
        exclusive: true;
        schema: {
          maxItems: 100;
        };
      }>;
  };
  export type ExecuteInput = {
    operation_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
    approval_id: string &
      tags.TagBase<{
        target: "string";
        kind: "format";
        value: "uuid";
        validate: '$importInternal("isFormatUuid")($input)';
        exclusive: ["format", "pattern"];
        schema: {
          format: "uuid";
        };
      }>;
  };
  export type ExecutionResult = {
    approval_id: string;
    purged: ContentPurgeProvider.Target[];
  };
}
