import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import { Prisma } from "@prisma/sdk";
import type { Response } from "express";

@Catch()
export class KnittingLogExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "요청을 처리하지 못했습니다.";
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === "object" && response !== null && "code" in response && "message" in response &&
        typeof response.code === "string" && typeof response.message === "string") {
        code = response.code;
        message = response.message;
      } else {
        code = status === 400
          ? "INVALID_INPUT"
          : status === 404
            ? "NOT_FOUND"
            : `HTTP_${status}`;
        message = status === 400
          ? "입력 형식이 올바르지 않습니다."
          : status === 404
            ? "대상을 찾을 수 없습니다."
            : message;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === "P2002" || exception.code === "P2034") {
        status = 409;
        code = "CONFLICT";
        message = "현재 상태와 충돌하는 요청입니다.";
      } else if (exception.code === "P2025") {
        status = 404;
        code = "NOT_FOUND";
        message = "대상을 찾을 수 없습니다.";
      }
    }
    // DB 오류의 SQL·접속 정보·인증값을 외부 응답에 포함하지 않습니다.
    host.switchToHttp().getResponse<Response>().status(status).json({
      code,
      message,
    });
  }
}
