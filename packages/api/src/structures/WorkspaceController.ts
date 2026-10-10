export namespace WorkspaceController {
  export namespace WorkspaceProvider {
    export type Timer = {
      id: string;
      workspace_id: string;
      owner_user_id: string;
      status: "paused" | "running" | "stopped";
      started_at: null | string;
      accumulated_seconds: number;
      version: number;
    };
  }
}
