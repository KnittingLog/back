import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";
import type { tags } from "typia";

import { CommunityProvider as C } from "../../providers/knittinglog/CommunityProvider";

@Controller({ path: "", version: "1" })
export class CommunityController {
  @core.TypedRoute.Get("feed")
  public feed(@Headers("authorization") authorization: string | undefined, @core.TypedQuery() query: C.Query): Promise<C.Feed> {
    return C.feed(authorization, query);
  }

  @core.TypedRoute.Post("posts")
  public create(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: C.Body): Promise<C.Post> {
    return C.create(authorization, input);
  }

  @core.TypedRoute.Get("posts/:id")
  public get(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<C.Post> {
    return C.get(authorization, id);
  }

  @HttpCode(204)
  @core.TypedRoute.Delete("posts/:id")
  public remove(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<void> {
    return C.remove(authorization, id);
  }

  @core.TypedRoute.Get("users/:id/posts")
  public byUser(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<C.Post[]> {
    return C.byUser(authorization, id);
  }

  @core.TypedRoute.Get("posts/:id/comments")
  public comments(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<C.Comment[]> {
    return C.comments(authorization, id);
  }

  @core.TypedRoute.Post("posts/:id/comments")
  public comment(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">,
    @core.TypedBody() input: C.Body): Promise<C.Comment> {
    return C.comment(authorization, id, input);
  }

  @HttpCode(204)
  @core.TypedRoute.Delete("post-comments/:id")
  public removeComment(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<void> {
    return C.removeComment(authorization, id);
  }

  @core.TypedRoute.Put("posts/:id/likes")
  public like(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<C.Like> {
    return C.like(authorization, id);
  }

  @HttpCode(204)
  @core.TypedRoute.Delete("posts/:id/likes")
  public unlike(@Headers(
    "authorization",
  ) authorization: string | undefined, @core.TypedParam(
    "id",
  ) id: string & tags.Format<"uuid">): Promise<void> {
    return C.unlike(authorization, id);
  }
}
