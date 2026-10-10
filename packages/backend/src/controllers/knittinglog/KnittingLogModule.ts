import { Module } from "@nestjs/common";

import { AccountController } from "./AccountController";
import { AuthController } from "./AuthController";
import { CommunityController } from "./CommunityController";
import { PolicyController } from "./PolicyController";
import {
  MembershipHistoryController,
  ProjectController,
  ProjectInvitationController,
} from "./ProjectController";
import { RecordCommentController, RecordController } from "./RecordController";
import { ReportController } from "./ReportController";
import { ReportOperatorController } from "./ReportOperatorController";
import {
  BlockController,
  FriendController,
  FriendRequestController,
} from "./SocialController";
import { CounterController, WorkspaceController } from "./WorkspaceController";

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
