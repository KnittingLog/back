import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";
import { tags } from "typia";

import { RecordProvider as R } from "../../providers/knittinglog/RecordProvider";

@Controller({ path: "records", version: "1" })
export class RecordController {
  @core.TypedRoute.Get(":id")
  public get(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<R.Record> {
    return R.get(auth, id);
  }

  @core.TypedRoute.Patch(":id")
  public update(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">, @core.TypedBody() input: R.Update): Promise<R.Record> {
    return R.update(auth, id, input);
  }

  @HttpCode(204)
  @core.TypedRoute.Delete(":id")
  public remove(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<void> {
    return R.remove(auth, id);
  }

  @core.TypedRoute.Get(":id/comments")
  public comments(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<R.Comment[]> {
    return R.comments(auth, id);
  }

  @core.TypedRoute.Post(":id/comments")
  public comment(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">, @core.TypedBody() input: R.Text): Promise<R.Comment> {
    return R.comment(auth, id, input);
  }

  @core.TypedRoute.Get(":id/reactions")
  public reactions(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<R.Reaction[]> {
    return R.reactions(auth, id);
  }

  @core.TypedRoute.Put(":id/reactions/:emoji")
  public react(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">, @core.TypedParam(
    "emoji",
  ) emoji: string): Promise<R.Reaction> {
    return R.react(auth, id, emoji);
  }

  @HttpCode(204)
  @core.TypedRoute.Delete(":id/reactions/:emoji")
  public async unreact(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">, @core.TypedParam(
    "emoji",
  ) emoji: string): Promise<void> {
    await R.react(auth, id, emoji, true);
  }
}

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
