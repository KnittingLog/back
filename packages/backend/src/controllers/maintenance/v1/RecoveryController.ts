import core from "@nestia/core";
import { Controller, Headers } from "@nestjs/common";

import { RecoveryProvider as R } from "../../../providers/maintenance/RecoveryProvider";

@Controller({ path: "admin/maintenance/recovery", version: "1" })
export class RecoveryController {
  @core.TypedRoute.Post("prepare")
  public prepare(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: R.Prepare): Promise<R.Snapshot[]> {
    return R.prepare(authorization, input);
  }

  @core.TypedRoute.Post("approvals")
  public approve(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: R.Approve): Promise<{ approval_id: string; expires_at: string }> {
    return R.approve(authorization, input);
  }

  @core.TypedRoute.Post("execute")
  public execute(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: R.Execute): Promise<{ restored: number }> {
    return R.execute(authorization, input);
  }

  @core.TypedRoute.Post("reverse-transfers/prepare")
  public prepareReverse(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: R.ReversePrepare): Promise<R.ReverseSnapshot> {
    return R.prepareReverse(authorization, input);
  }

  @core.TypedRoute.Post("reverse-transfers/approvals")
  public approveReverse(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: R.ReverseApprove): Promise<{ approval_id: string; expires_at: string }> {
    return R.approveReverse(authorization, input);
  }

  @core.TypedRoute.Post("reverse-transfers/execute")
  public executeReverse(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: R.ReverseExecute): Promise<R.ReverseResult> {
    return R.executeReverse(authorization, input);
  }
}
