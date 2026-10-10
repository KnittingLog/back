import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";
import { tags } from "typia";

import { RecordProvider } from "../../../providers/records/RecordProvider";
import { WorkspaceProvider as W } from "../../../providers/workspaces/WorkspaceProvider";

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
