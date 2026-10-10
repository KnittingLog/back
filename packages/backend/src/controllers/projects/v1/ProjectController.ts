import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";

import { ProjectProvider as P } from "../../../providers/projects/ProjectProvider";

@Controller({ path: "projects", version: "1" })
export class ProjectController {
  @core.TypedRoute.Post()
  public create(@Headers("authorization") auth: string | undefined, @core.TypedBody() input: P.Create): Promise<P.Project> {
    return P.create(auth, input);
  }

  @core.TypedRoute.Get()
  public list(@Headers("authorization") auth: string | undefined, @core.TypedQuery() query: { status?: P.Workspace["status"] }): Promise<P.Project[]> {
    return P.list(auth, query.status);
  }

  @core.TypedRoute.Get(":id")
  public get(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid): Promise<P.Project> {
    return P.get(auth, id);
  }

  @core.TypedRoute.Patch(":id")
  public update(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid, @core.TypedBody() input: P.Update): Promise<P.Project> {
    return P.update(auth, id, input);
  }

  @core.TypedRoute.Delete(":id")
  @HttpCode(204)
  public remove(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid): Promise<void> {
    return P.remove(auth, id);
  }

  @core.TypedRoute.Get(":id/memberships")
  public memberships(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid): Promise<P.Membership[]> {
    return P.memberships(auth, id);
  }

  @core.TypedRoute.Get(":id/workspaces")
  public workspaces(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid): Promise<P.Workspace[]> {
    return P.workspaces(auth, id);
  }

  @core.TypedRoute.Patch(":id/owner")
  public owner(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam("id") id: P.Uuid,
    @core.TypedBody() input: { owner_user_id: P.Uuid }): Promise<P.Project> {
    P.keys(input, ["owner_user_id"]);
    return P.owner(auth, id, input.owner_user_id);
  }

  @core.TypedRoute.Post(":id/invitations")
  public invite(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam("id") id: P.Uuid,
    @core.TypedBody() input: { recipient_id: P.Uuid }): Promise<P.Invitation> {
    P.keys(input, ["recipient_id"]);
    return P.invite(auth, id, input.recipient_id);
  }

  @core.TypedRoute.Post(":id/leave")
  @HttpCode(200)
  public leave(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam("id") id: P.Uuid,
    @core.TypedBody() input: P.Move): Promise<P.Transfer> {
    return P.move(auth, id, undefined, input);
  }

  @core.TypedRoute.Post(":id/members/:userId/kick")
  @HttpCode(200)
  public kick(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam("id") id: P.Uuid,
    @core.TypedParam(
      "userId",
    ) userId: P.Uuid, @core.TypedBody() input: P.Move): Promise<P.Transfer> {
    return P.move(auth, id, userId, input, true);
  }
}
