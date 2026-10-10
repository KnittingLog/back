import core from "@nestia/core";
import { Controller, Headers, HttpCode } from "@nestjs/common";

import { AuthProvider } from "../../providers/knittinglog/AuthProvider";

@Controller({ path: "auth", version: "1" })
export class AuthController {
  @core.TypedRoute.Post("register")
  public register(@core.TypedBody() input: AuthProvider.Registration): Promise<AuthProvider.RegistrationSession> {
    return AuthProvider.register(input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post("login")
  public login(@core.TypedBody() input: AuthProvider.Login): Promise<AuthProvider.Session> {
    return AuthProvider.login(input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post("refresh")
  public refresh(@core.TypedBody() input: AuthProvider.Refresh): Promise<AuthProvider.Session> {
    return AuthProvider.refresh(input);
  }

  @HttpCode(204)
  @core.TypedRoute.Post("logout")
  public logout(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: AuthProvider.Refresh): Promise<void> {
    return AuthProvider.logout(authorization, input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post("recovery")
  public recover(@core.TypedBody() input: AuthProvider.Recovery): Promise<AuthProvider.RegistrationSession> {
    return AuthProvider.recover(input);
  }

  @HttpCode(200)
  @core.TypedRoute.Post("recovery-code")
  public reissue(@Headers("authorization") authorization: string | undefined, @core.TypedBody() input: AuthProvider.Password): Promise<AuthProvider.RecoveryCode> {
    return AuthProvider.reissue(authorization, input);
  }
}
