import core from "@nestia/core";
import { Controller, Headers } from "@nestjs/common";

import { ContentPurgeProvider as P } from "../../../providers/maintenance/ContentPurgeProvider";

@Controller({ path: "admin/maintenance/content-purge", version: "1" })
export class ContentPurgeController {
  @core.TypedRoute.Post("prepare")
  public prepare(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: P.PrepareInput): Promise<P.Preview[]> {
    return P.prepare(authorization, input);
  }

  @core.TypedRoute.Post("approvals")
  public approve(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: P.ApproveInput): Promise<{ approval_id: string; expires_at: string }> {
    return P.approve(authorization, input);
  }

  @core.TypedRoute.Post("execute")
  public execute(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: P.ExecuteInput): Promise<P.ExecutionResult> {
    return P.execute(authorization, input);
  }
}
