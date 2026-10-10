import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/sdk";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
import { Singleton } from "tstl";
import typia from "typia";

interface IEnvironments {
  MODE: "local" | "dev" | "real";
  API_PORT: `${number}`;
  SYSTEM_PASSWORD: string;

  POSTGRES_URL: string;
  POSTGRES_HOST: string;
  POSTGRES_PORT: `${number}`;
  POSTGRES_DATABASE: string;
  POSTGRES_SCHEMA: string;
  POSTGRES_USERNAME: string;
  POSTGRES_USERNAME_READONLY: string;
  POSTGRES_PASSWORD: string;
}
const envSingleton = new Singleton(() => {
  const env = dotenv.config();
  dotenvExpand.expand(env);
  return typia.assert<IEnvironments>(process.env);
});
const prismaSingleton = new Singleton(
  () =>
    new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: MyGlobal.postgresConnectionString(envSingleton.get().POSTGRES_URL) },
        { schema: envSingleton.get().POSTGRES_SCHEMA },
      ),
    }),
);

/**
 * Global variables of the server.
 *
 * @author Samchon
 */
export class MyGlobal {
  public static testing: boolean = false;

  public static postgresConnectionString(value: string): string {
    const url = new URL(value);
    const options = url.searchParams.get("options")?.trim();
    // URL의 options가 pg 설정을 덮어쓰므로 마지막 세션 옵션으로 UTC를 지정합니다.
    url.searchParams.set(
      "options",
      options ? `${options} -c timezone=UTC` : "-c timezone=UTC",
    );
    return url.toString();
  }

  public static get prisma(): PrismaClient {
    return prismaSingleton.get();
  }
  public static get env(): IEnvironments {
    return envSingleton.get();
  }

  /**
   * Current mode.
   *
   *   - local: The server is on your local machine.
   *   - dev: The server is for the developer.
   *   - real: The server is for the real service.
   */
  public static get mode(): "local" | "dev" | "real" {
    modeWrapper.value ??= envSingleton.get().MODE;
    return modeWrapper.value;
  }

  /**
   * Set current mode.
   *
   * @param mode The new mode
   */
  public static setMode(mode: typeof MyGlobal.mode): void {
    typia.assert<typeof mode>(mode);
    modeWrapper.value = mode;
  }
}

interface IMode {
  value?: "local" | "dev" | "real";
}
const modeWrapper: IMode = {};
