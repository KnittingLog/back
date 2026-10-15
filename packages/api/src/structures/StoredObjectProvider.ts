import type { tags } from "typia";

export namespace StoredObjectProvider {
  export type PurgeExecute = {
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
}
