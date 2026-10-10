import { Module } from "@nestjs/common";

import { AccountController } from "./accounts/v1/AccountController";
import { AuthController } from "./auth/v1/AuthController";
import { CommunityController } from "./community/v1/CommunityController";
import { PolicyController } from "./policies/v1/PolicyController";
import { ProjectController } from "./projects/v1/ProjectController";
import { ProjectInvitationController } from "./projects/v1/ProjectInvitationController";
import { MembershipHistoryController } from "./projects/v1/MembershipHistoryController";
import { RecordController } from "./records/v1/RecordController";
import { RecordCommentController } from "./records/v1/RecordCommentController";
import { ReportController } from "./reports/v1/ReportController";
import { ReportOperatorController } from "./reports/v1/ReportOperatorController";
import { FriendRequestController } from "./social/v1/FriendRequestController";
import { FriendController } from "./social/v1/FriendController";
import { BlockController } from "./social/v1/BlockController";
import { WorkspaceController } from "./workspaces/v1/WorkspaceController";
import { CounterController } from "./workspaces/v1/CounterController";

@Module({
  controllers: [
    AccountController,
    AuthController,
    PolicyController,
    ProjectController,
    ProjectInvitationController,
    MembershipHistoryController,
    FriendRequestController,
    FriendController,
    BlockController,
    WorkspaceController,
    CounterController,
    RecordController,
    RecordCommentController,
    CommunityController,
    ReportController,
    ReportOperatorController,
  ],
})
export class KnittingLogModule {}
