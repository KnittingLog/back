export namespace RecordProvider {
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
  export type Create = {
    source: "manual" | "timer";
    body: null | string;
    duration_seconds: number;
    recorded_at: string;
  };
  export type Update = {
    body?: null | undefined | string;
    duration_seconds?: undefined | number;
  };
  export type Comment = {
    id: string;
    record_id: string;
    author_id: string;
    author_name: string;
    body: string;
  };
  export type Text = { body: string };
  export type Reaction = {
    id: string;
    record_id: string;
    user_id: string;
    emoji_code: string;
  };
}
