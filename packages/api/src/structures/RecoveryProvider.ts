import type { tags } from "typia";

export namespace RecoveryProvider {
  export type Prepare = {
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
    targets: RecoveryProvider.Target[] &
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
    reason: string;
    expires_at: string;
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
  export type Snapshot = {
    kind:
      | "counter"
      | "post"
      | "post_comment"
      | "project"
      | "record"
      | "record_comment"
      | "workspace";
    id: string;
    updated_at: string;
    owner_user_id: string;
    project_id: null | string;
    workspace_id: null | string;
    parent_id: null | string;
    version: null | number;
    workspace_version: null | number;
    deletion_operation_id: string;
    deleted_at: string;
    photo_object_id: null | string;
    state_hash: string;
  };
  export type Approve = {
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
    targets: RecoveryProvider.Target[] &
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
    reason: string;
    expires_at: string;
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
    expected_snapshots: RecoveryProvider.Snapshot[] &
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
  export type Execute = {
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
  export type ReversePrepare = {
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
    transfer_id: string &
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
    reason: string;
    expires_at: string;
  };
  export type ReverseSnapshot = {
    transfer_id: string;
    workspace_id: string;
    from_project_id: string;
    to_project_id: string;
    from_membership_id: string;
    to_membership_id: string;
    workspace_version: number;
    workspace_owner_user_id: string;
    state_hash: string;
  };
  export type ReverseApprove = {
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
    transfer_id: string &
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
    reason: string;
    expires_at: string;
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
    expected_snapshot: RecoveryProvider.ReverseSnapshot;
  };
  export type ReverseExecute = {
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
  export type ReverseResult = {
    approval_id: string;
    transfer_id: string;
    workspace_id: string;
    project_id: string;
    version: number;
  };
}
