import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NextFunction, Request, Response } from "express";
import { MyConfiguration } from "./MyConfiguration";
import { MyModule } from "./MyModule";
import { MyGlobal } from "./MyGlobal";
import { KnittingLogExceptionFilter } from "./controllers/common/KnittingLogExceptionFilter";

export class MyBackend {
  private application_?: INestApplication;

  public static configure(application: INestApplication): void {
    application.setGlobalPrefix("api", {
      exclude: [{ path: "monitors/{*path}", method: RequestMethod.ALL }],
    });
    application.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: "1",
    });
    application.useGlobalFilters(new KnittingLogExceptionFilter());
    application.enableCors();
    // 접두어 밖의 요청도 Express의 HTML 응답 대신 동일한 JSON 오류를 반환합니다.
    application.use((request: Request, response: Response, next: NextFunction): void => {
      if ((request.path.startsWith("/api/") && request.path !== "/api/") ||
        (request.path.startsWith("/monitors/") && request.path !== "/monitors/")) {
        next();
        return;
      }
      response.status(404).json({ code: "NOT_FOUND", message: "대상을 찾을 수 없습니다." });
    });
  }

  public async open(): Promise<void> {
    // MOUNT CONTROLLERS
    this.application_ = await NestFactory.create(MyModule, { logger: false });

    // DO OPEN
    MyBackend.configure(this.application_);
    await this.application_.listen(
      MyConfiguration.API_PORT(),
      MyGlobal.mode === "local" ? "127.0.0.1" : "0.0.0.0",
    );
  }

  public async close(): Promise<void> {
    if (this.application_ === undefined) return;

    // DO CLOSE
    await this.application_.close();
    delete this.application_;
  }
}
