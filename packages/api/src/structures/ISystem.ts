import type { Recordstringstring } from "./Recordstringstring";

/**
 * System Information.
 *
 * @author Samchon
 */
export type ISystem = {
  /**
   * Random Unique ID.
   */
  uid: number;

  /**
   * `process.argv`
   */
  arguments: string[];

  /**
   * Git commit info.
   */
  commit: ISystem.ICommit;

  /**
   * `package.json`
   */
  package: ISystem.IPackage;

  /**
   * Creation time of this server.
   */
  created_at: string;
};
export namespace ISystem {
  /**
   * Git commit info.
   */
  export type ICommit = {
    shortHash: string;
    branch: string;
    hash: string;
    subject: string;
    sanitizedSubject: string;
    body: string;
    author: ISystem.ICommit.IUser;
    committer: ISystem.ICommit.IUser;
    authored_at: string;
    committed_at: string;
    notes?: undefined | string;
    tags: string[];
  };
  export namespace ICommit {
    /**
     * Git user account info.
     */
    export type IUser = { name: string; email: string };
  }
  /**
   * NPM package info.
   */
  export type IPackage = {
    name: string;
    version: string;
    description: string;
    main?: undefined | string;
    typings?: undefined | string;
    scripts: Recordstringstring;
    repository: { type: "git"; url: string };
    author: string;
    license: string;
    bugs: { url: string };
    homepage: string;
    devDependencies?: undefined | Recordstringstring;
    dependencies: Recordstringstring;
    publishConfig?: undefined | { registry: string };
    files?: undefined | string[];
  };
}
