import type { tags } from "typia";

export namespace CommunityProvider {
  export type Query = {
    limit?:
      | undefined
      | (number &
          tags.TagBase<{
            target: "number";
            kind: "type";
            value: "uint32";
            validate: '$importInternal("isTypeUint32")($input)';
            exclusive: true;
            schema: {
              minimum: 0;
              type: "integer";
            };
          }> &
          tags.TagBase<{
            target: "number";
            kind: "minimum";
            value: 1;
            validate: "1 <= $input";
            exclusive: ["minimum", "exclusiveMinimum"];
            schema: {
              minimum: 1;
            };
          }> &
          tags.TagBase<{
            target: "number";
            kind: "maximum";
            value: 100;
            validate: "$input <= 100";
            exclusive: ["maximum", "exclusiveMaximum"];
            schema: {
              maximum: 100;
            };
          }>);
    cursor?: undefined | string;
  };
  export type Feed = {
    items: CommunityProvider.Post[];
    next_cursor: null | string;
  };
  export type Post = {
    id: string;
    author_id: string;
    author_name: string;
    body: string;
    created_at: string;
  };
  export type Body = { body: string };
  export type Comment = {
    id: string;
    post_id: string;
    author_id: string;
    author_name: string;
    body: string;
  };
  export type Like = { id: string; post_id: string; user_id: string };
}
