import {
  INestApplication,
  RequestMethod,
  VersioningType,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express, { type NextFunction, type Request, type Response } from "express";
import { MyConfiguration } from "./MyConfiguration";
import { MyModule } from "./MyModule";
import { MyGlobal } from "./MyGlobal";
import { KnittingLogExceptionFilter } from "./controllers/common/KnittingLogExceptionFilter";
import { configureStorageFromEnvironment } from "./providers/storage/StorageBootstrap";

export class MyBackend {
  private application_?: INestApplication;

  public static configure(application: INestApplication): void {
    // 이 경로에만 큰 JSON 제한을 먼저 등록합니다. Nest 기본 제한은 다른 API에 유지합니다.
    const storageJsonParser = express.json({ limit: "14mb" });
    application.use("/api/v1/storage/objects", function storageObjectJsonParser(request: Request, response: Response, next: NextFunction): void {
      storageJsonParser(request, response, next);
    });
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
    await configureStorageFromEnvironment(MyGlobal.mode);
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
