import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";
import { tags } from "typia";

import { RecordProvider } from "../../providers/knittinglog/RecordProvider";
import { WorkspaceProvider as W } from "../../providers/knittinglog/WorkspaceProvider";

@Controller({ path: "workspaces", version: "1" })
export class WorkspaceController {
  @core.TypedRoute.Get(":id")
  public get(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<W.Workspace> {
    return W.get(auth, id);
  }

  @core.TypedRoute.Patch(":id")
  public update(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Update,
  ): Promise<W.Workspace> {
    return W.update(auth, id, input);
  }

  @core.TypedRoute.Get(":id/counters")
  public counters(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<W.Counter[]> {
    return W.counters(auth, id);
  }

  @core.TypedRoute.Post(":id/counters")
  public createCounter(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.CounterCreate,
  ): Promise<W.Counter> {
    return W.createCounter(auth, id, input);
  }

  @core.TypedRoute.Patch(":id/counters/order")
  public order(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Order,
  ): Promise<W.Counter[]> {
    return W.order(auth, id, input);
  }

  @core.TypedRoute.Get(":id/records")
  public records(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<RecordProvider.Record[]> {
    return RecordProvider.list(auth, id);
  }

  @core.TypedRoute.Post(":id/records")
  public createRecord(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: RecordProvider.Create,
  ): Promise<RecordProvider.Record> {
    return RecordProvider.create(auth, id, input);
  }

  @core.TypedRoute.Get(":id/timer")
  public timer(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
  ): Promise<W.Timer | null> {
    return W.timer(auth, id);
  }

  @core.TypedRoute.Post(":id/timer/start")
  public start(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Command,
  ): Promise<W.Timer> {
    return W.timerCommand(auth, id, "start", input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post(":id/timer/pause")
  public pause(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Command,
  ): Promise<W.Timer> {
    return W.timerCommand(auth, id, "pause", input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post(":id/timer/resume")
  public resume(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Command,
  ): Promise<W.Timer> {
    return W.timerCommand(auth, id, "resume", input);
  }

  @core.TypedRoute.Post(":id/timer/stop")
  public stop(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Stop,
  ): Promise<RecordProvider.Record> {
    return W.stop(auth, id, input);
  }
}

@Controller({ path: "counters", version: "1" })
export class CounterController {
  @core.TypedRoute.Patch(":id")
  public update(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.CounterUpdate,
  ): Promise<W.Counter> {
    return W.counter(auth, id, "update", input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post(":id/adjust")
  public adjust(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Adjust,
  ): Promise<W.Counter> {
    return W.counter(auth, id, "adjust", input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post(":id/reset")
  public reset(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Command,
  ): Promise<W.Counter> {
    return W.counter(auth, id, "reset", input);
  }

  @HttpCode(204)
  @core.TypedRoute.Delete(":id")
  public async remove(
    @Headers("authorization") auth: string | undefined,
    @core.TypedParam("id") id: string & tags.Format<"uuid">,
    @core.TypedBody() input: W.Command,
  ): Promise<void> {
    await W.counter(auth, id, "delete", input);
  }
}
