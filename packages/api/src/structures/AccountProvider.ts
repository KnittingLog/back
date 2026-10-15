import type { tags } from "typia";

export namespace AccountProvider {
  export type Update = {
    handle?: undefined | string;
    nickname?: undefined | string;
    biography?: null | undefined | string;
    visibility?: undefined | "friends" | "private" | "public";
    profile_photo_object_id?:
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
  export type PolicyConsentInput = { policy_document_ids: string[] };
  export type Membership = {
    id: string;
    project_id: string;
    user_id: string;
    left_at: null | string;
  };
  export type Record = {
    id: string;
    workspace_id: string;
    author_id: string;
    author_name: string;
    source: "manual" | "timer";
    body: null | string;
    duration_seconds: number;
    recorded_at: string;
  };
  export type Statistics = { total_duration_seconds: number };
}
