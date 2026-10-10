import type { tags } from "typia";

export namespace ProjectProvider {
  export type Create = {
    name: string &
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
        value: 255;
        validate: '$importInternal("_stringLength")($input) <= 255';
        exclusive: true;
        schema: {
          maxLength: 255;
        };
      }>;
    cover_photo_object_id?:
      | null
      | undefined
      | (string &
          tags.TagBase<{
            target: "string";
            kind: "format";
            value: "uuid";
            validate: '$importInternal("isFormatUuid")($input)';
            exclusive: ["format", "pattern"];
            schema: {
              format: "uuid";
            };
          }>);
    invitee_user_ids?:
      | undefined
      | ((string &
          tags.TagBase<{
            target: "string";
            kind: "format";
            value: "uuid";
            validate: '$importInternal("isFormatUuid")($input)';
            exclusive: ["format", "pattern"];
            schema: {
              format: "uuid";
            };
          }>)[] &
          tags.TagBase<{
            target: "array";
            kind: "maxItems";
            value: 100;
            validate: "$input.length <= 100";
            exclusive: true;
            schema: {
              maxItems: 100;
            };
          }>);
  };
  export type Project = {
    id: string;
    owner_user_id: string;
    name: string;
    cover_photo_object_id: null | string;
  };
  export type Update = {
    name?:
      | undefined
      | (string &
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
            value: 255;
            validate: '$importInternal("_stringLength")($input) <= 255';
            exclusive: true;
            schema: {
              maxLength: 255;
            };
          }>);
    cover_photo_object_id?:
      | null
      | undefined
      | (string &
          tags.TagBase<{
            target: "string";
            kind: "format";
            value: "uuid";
            validate: '$importInternal("isFormatUuid")($input)';
            exclusive: ["format", "pattern"];
            schema: {
              format: "uuid";
            };
          }>);
  };
  export type Membership = {
    id: string;
    project_id: string;
    user_id: string;
    left_at: null | string;
  };
  export type Workspace = {
    id: string;
    project_id: string;
    owner_user_id: string;
    status: "active" | "done" | "paused";
    yarn_notes: null | string;
    needle_notes: null | string;
    ended_at: null | string;
    version: number;
  };
  export type Invitation = {
    id: string;
    project_id: string;
    recipient_id: string;
    status: "accepted" | "cancelled" | "pending" | "rejected";
  };
  export type Move = {
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
    workspace_id: string &
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
    expected_version: number &
      tags.TagBase<{
        target: "number";
        kind: "type";
        value: "int32";
        validate: '$importInternal("isTypeInt32")($input)';
        exclusive: true;
        schema: {
          type: "integer";
        };
      }> &
      tags.TagBase<{
        target: "number";
        kind: "minimum";
        value: 0;
        validate: "0 <= $input";
        exclusive: ["minimum", "exclusiveMinimum"];
        schema: {
          minimum: 0;
        };
      }>;
    successor_user_id?:
      | undefined
      | (string &
          tags.TagBase<{
            target: "string";
            kind: "format";
            value: "uuid";
            validate: '$importInternal("isFormatUuid")($input)';
            exclusive: ["format", "pattern"];
            schema: {
              format: "uuid";
            };
          }>);
  };
  export type Transfer = {
    id: string;
    workspace_id: string;
    from_project_id: string;
    to_project_id: string;
    from_membership_id: string;
    to_membership_id: string;
    workspace_version: number;
  };
}
