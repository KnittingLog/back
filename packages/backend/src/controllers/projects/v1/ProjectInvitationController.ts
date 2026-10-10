import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";

import { ProjectProvider as P } from "../../../providers/projects/ProjectProvider";

@Controller({ path: "project-invitations", version: "1" })
export class ProjectInvitationController {
  @core.TypedRoute.Get()
  public list(@Headers("authorization") auth: string | undefined, @core.TypedQuery() query: { status?: P.Invitation["status"] }): Promise<P.Invitation[]> {
    return P.invitations(auth, query.status);
  }

  @core.TypedRoute.Post(":id/accept")
  @HttpCode(200)
  public accept(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid): Promise<P.Membership> {
    return P.accept(auth, id);
  }

  @core.TypedRoute.Post(":id/reject")
  @HttpCode(204)
  public reject(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid): Promise<void> {
    return P.cancel(auth, id, true);
  }

  @core.TypedRoute.Delete(":id")
  @HttpCode(204)
  public cancel(@Headers(
    "authorization",
  ) auth: string | undefined, @core.TypedParam(
    "id",
  ) id: P.Uuid): Promise<void> {
    return P.cancel(auth, id);
  }
}
