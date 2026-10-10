import type { tags } from "typia";

export namespace ReportProvider {
  export type Input = {
    reason_code: "abuse" | "inappropriate" | "other" | "privacy" | "spam";
    detail?: null | undefined | string;
    target_user_id?:
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
    post_id?:
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
    block_target?: undefined | boolean;
  };
  export type Receipt = {
    id: string;
    reporter_id: string;
    target_user_id: null | string;
    post_id: null | string;
    reason_code: "abuse" | "inappropriate" | "other" | "privacy" | "spam";
    detail: null | string;
    status: "closed" | "received" | "reviewing";
  };
  export type OperatorQuery = {
    status?: undefined | "closed" | "received" | "reviewing";
  };
  export type Detail = {
    id: string;
    reporter_id: string;
    target_user_id: null | string;
    post_id: null | string;
    reason_code: "abuse" | "inappropriate" | "other" | "privacy" | "spam";
    detail: null | string;
    status: "closed" | "received" | "reviewing";
    target_snapshot: ReportProvider.Evidence;
    actions: ReportProvider.Action[];
  };
  export type Evidence = {
    schema_version: number;
    handle?: null | undefined | string;
    nickname?: null | undefined | string;
    biography?: null | undefined | string;
    author_id?: undefined | string;
    body?: undefined | string;
    source_updated_at: string;
  };
  export type Action = {
    id: string;
    report_id: string;
    actor_user_id: string;
    action_code: "close" | "hide_post" | "review";
    reason: string;
    result: {
      status: "closed" | "received" | "reviewing";
      post_hidden?: undefined | boolean;
    };
  };
  export type ActionInput = {
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
    action_code: "close" | "hide_post" | "review";
    reason: string;
    expected_status?: undefined | "closed" | "received" | "reviewing";
  };
}
