import core from "@nestia/core";
import { Controller, Headers } from "@nestjs/common";
import type { tags } from "typia";

import { ReportProvider as R } from "../../../providers/reports/ReportProvider";

@Controller({ path: "admin/reports", version: "1" })
export class ReportOperatorController {
  @core.TypedRoute.Get()
  public queue(@Headers("authorization") authorization: string | undefined, @core.TypedQuery() query: R.OperatorQuery): Promise<R.Detail[]> {
    return R.queue(authorization, query);
  }

  @core.TypedRoute.Get(":id")
  public inspect(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<R.Detail> {
    return R.inspect(authorization, id);
  }

  @core.TypedRoute.Post(":id/actions")
  public action(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">,
    @core.TypedBody() input: R.ActionInput): Promise<R.Action> {
    return R.action(authorization, id, input);
  }
}
