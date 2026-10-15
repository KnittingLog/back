import type { tags } from "typia";

export type UploadBody = {
  data_base64: string &
    tags.TagBase<{
      target: "string";
      kind: "maxLength";
      value: 13981016;
      validate: '$importInternal("_stringLength")($input) <= 13981016';
      exclusive: true;
      schema: {
        maxLength: 13981016;
      };
    }>;
};
