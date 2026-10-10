import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";
import { tags } from "typia";

import { RecordProvider as R } from "../../../providers/records/RecordProvider";

@Controller({ path: "record-comments", version: "1" })
export class RecordCommentController {
  @HttpCode(204)
  @core.TypedRoute.Delete(":id")
  public remove(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<void> {
    return R.removeComment(auth, id);
  }
}
