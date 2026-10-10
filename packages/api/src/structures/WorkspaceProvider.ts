export namespace WorkspaceProvider {
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
  export type Update = {
    status?: undefined | "active" | "done" | "paused";
    yarn_notes?: null | undefined | string;
    needle_notes?: null | undefined | string;
  };
  export type Counter = {
    id: string;
    workspace_id: string;
    name: string;
    value: number;
    target_value: null | number;
    is_visible: boolean;
    sort_order: number;
    version: number;
  };
  export type CounterCreate = {
    operation_id: string;
    expected_version: number;
    name: string;
    target_value: null | number;
    is_visible: boolean;
  };
  export type Order = {
    operation_id: string;
    expected_version: number;
    counter_ids: string[];
  };
  export type Command = { operation_id: string; expected_version: number };
  export type Stop = {
    operation_id: string;
    expected_version: number;
    body?: null | undefined | string;
  };
  export type CounterUpdate = {
    operation_id: string;
    expected_version: number;
    name?: undefined | string;
    value?: undefined | number;
    target_value?: null | undefined | number;
    is_visible?: undefined | boolean;
  };
  export type Adjust = { operation_id: string; delta: -1 | 1 };
}
