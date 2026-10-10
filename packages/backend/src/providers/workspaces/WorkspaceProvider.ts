import type {
  project_counters,
  project_timers,
  project_workspaces,
} from "@prisma/sdk";
import { AuthProvider } from "../auth/AuthProvider";
import { KnittingLogContext as K } from "../common/KnittingLogContext";
import { RecordProvider } from "../records/RecordProvider";

export namespace WorkspaceProvider {
  export interface Workspace {
    id: string;
    project_id: string;
    owner_user_id: string;
    status: "active" | "paused" | "done";
    yarn_notes: string | null;
    needle_notes: string | null;
    ended_at: string | null;
    version: number;
  }
  export interface Counter {
    id: string;
    workspace_id: string;
    name: string;
    value: number;
    target_value: number | null;
    is_visible: boolean;
    sort_order: number;
    version: number;
  }
  export interface Timer {
    id: string;
    workspace_id: string;
    owner_user_id: string;
    status: "running" | "paused" | "stopped";
    started_at: string | null;
    accumulated_seconds: number;
    version: number;
  }
  export interface Update {
    status?: "active" | "paused" | "done";
    yarn_notes?: string | null;
    needle_notes?: string | null;
  }
  export interface Command {
    operation_id: string;
    expected_version: number;
  }
  export interface CounterCreate extends Command {
    name: string;
    target_value: number | null;
    is_visible: boolean;
  }
  export interface CounterUpdate extends Command {
    name?: string;
    value?: number;
    target_value?: number | null;
    is_visible?: boolean;
  }
  export interface Adjust {
    operation_id: string;
    delta: 1 | -1;
  }
  export interface Order extends Command {
    counter_ids: string[];
  }
  export interface Stop extends Command {
    body?: string | null;
  }

  export const view = (row: project_workspaces): Workspace => ({
    id: row.id,
    project_id: row.project_id,
    owner_user_id: row.owner_user_id,
    status: row.status,
    yarn_notes: row.yarn_notes,
    needle_notes: row.needle_notes,
    ended_at: row.ended_at?.toISOString() ?? null,
    version: row.version,
  });
  const counterView = (row: project_counters): Counter => ({
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    value: row.value,
    target_value: row.target_value,
    is_visible: row.is_visible,
    sort_order: row.sort_order,
    version: row.version,
  });
  const timerView = (row: project_timers): Timer => ({
    id: row.id,
    workspace_id: row.workspace_id,
    owner_user_id: row.owner_user_id,
    status: row.status,
    started_at: row.started_at?.toISOString() ?? null,
    accumulated_seconds: row.accumulated_seconds,
    version: row.version,
  });

  function available(status: string): void {
    if (status === "done") K.fail(
      409,
      "WORKSPACE_DONE",
      "완료한 작업 공간에서는 새 작업을 수행할 수 없습니다.",
    );
  }

  export function get(auth: string | undefined, id: string): Promise<Workspace> {
    return K.transaction(async (tx) =>
      view(await K.workspace(tx, (await AuthProvider.actor(auth, tx)).id, id)),
    );
  }

  /**
   * @evidence docs/requirements.md#상태-전이 상태별 종료 시각을 맞추고 활성 타이머가 있으면 완료 전환을 거부한다.
   */
  export function update(auth: string | undefined, id: string, input: Update): Promise<Workspace> {
    K.keys(input, ["status", "yarn_notes", "needle_notes"]);
    for (const value of [input.yarn_notes, input.needle_notes]) {
      if (value !== undefined && value !== null && value.length > 20_000) K.fail(
        400,
        "INVALID_INPUT",
        "메모가 너무 깁니다.",
      );
    }
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const workspace = await K.workspace(tx, actor.id, id, true);
      if (input.status === "done" && await tx.project_timers.count({ where: { workspace_id: id, status: { not: "stopped" }, deleted_at: null } }))
        K.fail(409, "TIMER_RUNNING", "타이머를 먼저 종료해야 합니다.");
      const ended_at = input.status === undefined ? workspace.ended_at : input.status === "done" ? (workspace.ended_at ?? new Date()) : null;
      return view(await tx.project_workspaces.update({ where: { id }, data: { ...input, ended_at, version: { increment: 1 }, ...K.changed(actor.id) } }));
    });
  }

  export function counters(auth: string | undefined, workspaceId: string): Promise<Counter[]> {
    return K.transaction(async (tx) => {
      await K.workspace(tx, (await AuthProvider.actor(auth, tx)).id, workspaceId);
      const rows = await tx.project_counters.findMany({ where: { workspace_id: workspaceId, deleted_at: null }, orderBy: [{ sort_order: "asc" }, { id: "asc" }] });
      return rows.map(counterView);
    });
  }

  export function createCounter(auth: string | undefined, workspaceId: string, input: CounterCreate): Promise<Counter> {
    K.keys(input, [
      "operation_id",
      "expected_version",
      "name",
      "target_value",
      "is_visible",
    ]);
    if (!input.name.trim() || input.name.length > 100) K.fail(
      400,
      "INVALID_INPUT",
      "카운터 이름이 올바르지 않습니다.",
    );
    if (input.target_value !== null) RecordProvider.duration(
      input.target_value,
    );
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const workspace = await K.workspace(tx, actor.id, workspaceId, true);
      return K.command(tx, actor.id, input.operation_id, "counter_create", { workspaceId, ...input }, async () => {
        available(workspace.status);
        K.version(workspace.version, input.expected_version);
        const order = await tx.project_counters.aggregate({ where: { workspace_id: workspaceId, deleted_at: null }, _max: { sort_order: true } });
        const row = await tx.project_counters.create({ data: { workspace_id: workspaceId, name: input.name.trim(), target_value: input.target_value, is_visible: input.is_visible, sort_order: (order._max.sort_order ?? -1) + 1, ...K.audit(actor.id) } });
        await K.bump(tx, workspaceId, actor.id);
        return counterView(row);
      });
    });
  }

  export function order(auth: string | undefined, workspaceId: string, input: Order): Promise<Counter[]> {
    K.keys(input, ["operation_id", "expected_version", "counter_ids"]);
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const workspace = await K.workspace(tx, actor.id, workspaceId, true);
      return K.command(tx, actor.id, input.operation_id, "counter_order", { workspaceId, ...input }, async () => {
        available(workspace.status);
        K.version(workspace.version, input.expected_version);
        const rows = await tx.project_counters.findMany({ where: { workspace_id: workspaceId, deleted_at: null } });
        if (input.counter_ids.length !== rows.length || new Set(input.counter_ids).size !== rows.length || input.counter_ids.some((id) => !rows.some((row) => row.id === id)))
          K.fail(400, "INVALID_INPUT", "현재 작업 공간의 카운터를 한 번씩 지정해야 합니다.");
        const results: Counter[] = [];
        for (const [sort_order, id] of input.counter_ids.entries()) results.push(counterView(await tx.project_counters.update({ where: { id }, data: { sort_order, version: { increment: 1 }, ...K.changed(actor.id) } })));
        await K.bump(tx, workspaceId, actor.id);
        return results;
      });
    });
  }

  export function counter(auth: string | undefined, id: string, kind: "adjust" | "update" | "reset" | "delete", input: Adjust | CounterUpdate | Command): Promise<Counter> {
    K.keys(
      input,
      kind === "adjust"
        ? ["operation_id", "delta"]
        : kind === "update"
          ? [
              "operation_id",
              "expected_version",
              "name",
              "value",
              "target_value",
              "is_visible",
            ]
          : ["operation_id", "expected_version"],
    );
    const update = input as CounterUpdate;
    if (kind === "update") {
      if (update.value !== undefined) RecordProvider.duration(update.value);
      if (update.target_value !== undefined && update.target_value !== null) RecordProvider.duration(
        update.target_value,
      );
      if (update.name !== undefined && (!update.name.trim() || update.name.length > 100)) K.fail(
        400,
        "INVALID_INPUT",
        "카운터 이름이 올바르지 않습니다.",
      );
    }
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const row = await tx.project_counters.findUnique({ where: { id } });
      if (!row) K.fail(404, "NOT_FOUND", "카운터를 찾을 수 없습니다.");
      const workspace = await K.workspace(tx, actor.id, row.workspace_id, true);
      return K.command(tx, actor.id, input.operation_id, `counter_${kind}`, { id, ...input }, async () => {
        if (row.deleted_at) K.fail(404, "NOT_FOUND", "카운터를 찾을 수 없습니다.");
        available(workspace.status);
        if (kind !== "adjust") K.version(workspace.version, update.expected_version);
        const delta = (input as Adjust).delta;
        if (kind === "adjust" && delta !== 1 && delta !== -1) K.fail(400, "INVALID_INPUT", "증감 값은 1 또는 -1이어야 합니다.");
        const value = kind === "adjust" ? row.value + delta : kind === "reset" ? 0 : (update.value ?? row.value);
        if (value < 0) K.fail(409, "COUNTER_NEGATIVE", "카운터는 음수가 될 수 없습니다.");
        RecordProvider.duration(value);
        const deleted_at = kind === "delete" ? new Date() : null;
        const changed = await tx.project_counters.update({ where: { id }, data: {
          value, ...(kind === "update" ? { name: update.name?.trim(), target_value: update.target_value, is_visible: update.is_visible } : {}),
          deleted_at, deletion_operation_id: deleted_at ? input.operation_id : null,
          version: { increment: 1 }, ...K.changed(actor.id),
        } });
        await K.bump(tx, workspace.id, actor.id);
        return counterView(changed);
      });
    });
  }

  export function timer(auth: string | undefined, workspaceId: string): Promise<Timer | null> {
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const workspace = await K.workspace(tx, actor.id, workspaceId);
      if (workspace.owner_user_id !== actor.id) K.fail(403, "FORBIDDEN", "본인의 타이머만 조회할 수 있습니다.");
      const row = await tx.project_timers.findFirst({ where: { workspace_id: workspaceId, status: { not: "stopped" }, deleted_at: null } });
      return row ? timerView(row) : null;
    });
  }

  export function timerCommand(auth: string | undefined, workspaceId: string, kind: "start" | "pause" | "resume", input: Command): Promise<Timer> {
    K.keys(input, ["operation_id", "expected_version"]);
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const workspace = await K.workspace(tx, actor.id, workspaceId, true);
      return K.command(tx, actor.id, input.operation_id, `timer_${kind}`, { workspaceId, ...input }, async () => {
        available(workspace.status);
        K.version(workspace.version, input.expected_version);
        const row = await tx.project_timers.findFirst({ where: { workspace_id: workspaceId, status: { not: "stopped" }, deleted_at: null } });
        const now = new Date();
        let result: project_timers;
        if (kind === "start") {
          if (row) K.fail(409, "TIMER_EXISTS", "진행 중인 타이머가 있습니다.");
          result = await tx.project_timers.create({ data: { workspace_id: workspaceId, owner_user_id: actor.id, started_at: now, ...K.audit(actor.id) } });
        } else {
          if (!row || row.owner_user_id !== actor.id || row.status !== (kind === "pause" ? "running" : "paused"))
            K.fail(409, "TIMER_STATE", "타이머 상태가 변경됐습니다.");
          const seconds = row.accumulated_seconds + (row.started_at ? Math.max(0, Math.floor((now.getTime() - row.started_at.getTime()) / 1000)) : 0);
          RecordProvider.duration(seconds);
          result = await tx.project_timers.update({ where: { id: row.id }, data: { status: kind === "pause" ? "paused" : "running", started_at: kind === "pause" ? null : now, accumulated_seconds: seconds, version: { increment: 1 }, ...K.changed(actor.id) } });
        }
        await K.bump(tx, workspaceId, actor.id);
        return timerView(result);
      });
    });
  }

  export function stop(auth: string | undefined, workspaceId: string, input: Stop): Promise<RecordProvider.Record> {
    K.keys(input, ["operation_id", "expected_version", "body"]);
    if (input.body !== undefined && input.body !== null && input.body.length > 20_000) K.fail(
      400,
      "INVALID_INPUT",
      "본문이 너무 깁니다.",
    );
    return K.transaction(async (tx) => {
      const actor = await AuthProvider.actor(auth, tx);
      const workspace = await K.workspace(tx, actor.id, workspaceId, true);
      return K.command(tx, actor.id, input.operation_id, "timer_stop", { workspaceId, ...input }, async () => {
        available(workspace.status);
        K.version(workspace.version, input.expected_version);
        const row = await tx.project_timers.findFirst({ where: { workspace_id: workspaceId, status: { not: "stopped" }, deleted_at: null } });
        if (!row || row.owner_user_id !== actor.id) K.fail(409, "TIMER_STATE", "진행 중인 타이머가 없습니다.");
        const now = new Date();
        const duration_seconds = row.accumulated_seconds + (row.started_at ? Math.max(0, Math.floor((now.getTime() - row.started_at.getTime()) / 1000)) : 0);
        RecordProvider.duration(duration_seconds);
        const record = await tx.project_records.create({ data: { workspace_id: workspaceId, author_id: actor.id, source: "timer", body: input.body ?? null, duration_seconds, recorded_at: now, ...K.audit(actor.id) } });
        await tx.project_timers.update({ where: { id: row.id }, data: { status: "stopped", started_at: null, stopped_at: now, record_id: record.id, accumulated_seconds: duration_seconds, version: { increment: 1 }, ...K.changed(actor.id) } });
        await K.bump(tx, workspaceId, actor.id);
        return RecordProvider.view(record, actor.nickname ?? "");
      });
    });
  }
}
