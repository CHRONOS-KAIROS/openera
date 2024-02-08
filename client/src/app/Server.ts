/**
 * Interface between the frontend and backend API
 *
 * The main jobs of this file are to keep track of which API endpoints to use,
 * handle authentication, raise HTTP errors, and any other transport-related
 * tasks.  Currently, as little postprocessing as possible is performed here,
 * but that may change according to architectural need.
 *
 * @packageDocumentation
 */
import { forceArray, isSchemaSummary } from "./Util";
import * as Sdf from "../types/Sdf";
import * as Types from "../types/Types";
import { JobId } from "../induction/Types";

/**
 * We need to manually escape `/`'s because the hex-encoded version, `%2F` will
 * still be routed by gunicorn (and most servers) as if it were a `/`. There is
 * corresponding code on the backend to escape `_FSLASH_`.
 */
const escapeForwardSlash = (x: string) => x.replace(/\//g, "_FSLASH_");

const DEV_API_PORT = 8000;

export type WikidataValues = {
  node: string;
  label: string;
  description: string;
};

export class Server {
  private clientVersion: Types.ClientVersion;

  constructor(clientVersion: Types.ClientVersion) {
    this.clientVersion = clientVersion;
  }

  /**
   * @param path  An array of path elements which will be URI-encoded
   * @param __namedParameters `params`: Query parameters
   */
  public static makeServerUrl = (
    path: string[],
    {
      params = {},
    }: {
      params?: { [x: string]: string };
    } = {},
  ): string => {
    const { hostname, protocol } = window.location;
    const useDevApi = hostname === "localhost" && path[0] === "api";
    const port = useDevApi ? DEV_API_PORT : window.location.port;
    const encodedPath = forceArray(path)
      .map(escapeForwardSlash)
      .map(encodeURIComponent)
      .join("/");
    const encodedParams =
      Object.keys(params).length === 0 ? "" : `?${new URLSearchParams(params)}`;
    return `${protocol}//${hostname}:${port}/${encodedPath}${encodedParams}`;
  };

  /**
   * Fetch a route from the API.
   *
   * This handles a few conveniences like authentication, throwing HTTP errors,
   * and prepending `/api`. This should be used instead of `fetch` whenever
   * possible.
   *
   * @param path  An array of path elements which will be URI-encoded
   * @param __namedParameters `noThrow`: do not throw the repsonse on HTTP error,
   * off by default in order to avoid unnoticed silent errors.
   */
  public apiFetch = async (
    path: string[],
    {
      queryParams = {},
      init = {},
      noThrow = false,
    }: {
      queryParams?: { [x: string]: string };
      init?: { [k: string]: any };
      noThrow?: boolean;
    } = {},
  ): Promise<Response> => {
    let headers = init.headers || {};
    init.headers = { ...headers };
    path.unshift("api");
    const urlOpts = {
      params: { ...queryParams, clientVersion: this.clientVersion },
    };
    const resp = await fetch(Server.makeServerUrl(path, urlOpts), init);
    if (!resp.ok && !noThrow) throw resp;
    return resp;
  };

  /** Upload a list of files as individual requests. */
  public uploadSchemaJson = async (
    documents: Sdf.Document[],
    clientId: Types.ClientId,
    overwrite: boolean = false,
  ): Promise<PromiseSettledResult<Response | Error>[]> => {
    const putSchema = (doc: Sdf.Document) => {
      try {
        const atId = doc["@id"];
        if (typeof atId !== "string")
          return Promise.reject(new Error("Schema @id is not a string."));
        return this.apiFetch(["schemas", atId], {
          init: {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId,
              sdf: doc,
            }),
          },
          queryParams: { overwrite: overwrite ? "1" : "0" },
        });
      } catch (e) {
        return Promise.reject(e);
      }
    };
    return Promise.allSettled(documents.map(putSchema));
  };

  public getSchemaJSONList = async (): Promise<Types.SchemaSummary[]> => {
    const resp = await this.apiFetch(["schemas"]);
    const body = (await resp.json()) as unknown;
    if (
      body instanceof Array &&
      (body.length === 0 || isSchemaSummary(body[0]))
    )
      return body;
    else {
      console.error(body);
      throw new Error("Server data does not conform to SchemaSummary.");
    }
  };

  public getPackagedSchemas = async (
    name: string,
    schemaIds: Sdf.DocumentId[],
  ): Promise<string> => {
    const options = {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, schemaIds }),
      },
    };
    const resp = await this.apiFetch(["package"], options);
    return resp.text();
  };

  public getZippedSchemas = async (
    schemaIds: Sdf.DocumentId[],
  ): Promise<Blob> => {
    const options = {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schemaIds: schemaIds }),
      },
    };
    const resp = await this.apiFetch(["zip"], options);
    return resp.blob();
  };

  public getEventPrimitives = async (): Promise<
    Map<Sdf.EventPrimitiveId, Sdf.EventPrimitive>
  > => {
    const resp = await this.apiFetch(["primitives", "events"]);
    return new Map(Object.entries(await resp.json())) as Map<
      Sdf.EventPrimitiveId,
      Sdf.EventPrimitive
    >;
  };

  /**
   * Get the version of the client code to ensure that it is compatible with
   * the API server.
   * */
  public static getClientVersion = async (): Promise<Types.ClientVersion> => {
    const resp = await fetch(Server.makeServerUrl(["client-version"]));
    return (await resp.text()) as Types.ClientVersion;
  };

  public getSchemaJSON = async (
    schemaId: Sdf.DocumentId,
  ): Promise<Sdf.Document> => {
    const resp = await this.apiFetch(["schemas", schemaId]);
    const body = await resp.json();
    return body;
  };

  public postNewSchemaJson = async (schemaName: string): Promise<Response> => {
    const options = {
      init: {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: schemaName }),
      },
    };
    const resp = await this.apiFetch(["schemas"], options);
    return resp;
  };

  public updateSchemaJSON = async (
    schemaId: Sdf.DocumentId,
    clientId: Types.ClientId,
    sdf: Sdf.Document,
  ): Promise<Response> => {
    const opts = {
      init: {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdf, clientId }),
      },
      queryParams: { overwrite: "1" },
    };
    const resp = await this.apiFetch(["schemas", schemaId], opts);
    return resp;
  };

  public updateSchemaTags = async (
    schemaId: Sdf.DocumentId,
    clientId: Types.ClientId,
    tags: string[],
  ): Promise<Response> => {
    const opts = {
      init: {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tags,
          clientId,
        }),
      },
    };
    const resp = await this.apiFetch(["schemas", schemaId, "tags"], opts);
    return resp;
  };

  public deleteSchemaJSON = async (
    schemaId: Sdf.DocumentId,
    clientId: Types.ClientId,
  ): Promise<Response> => {
    const resp = await this.apiFetch(["schemas", schemaId], {
      init: { method: "DELETE", body: JSON.stringify({ clientId }) },
    });
    return resp;
  };

  public copySchema = async (schemaId: Sdf.DocumentId): Promise<Response> => {
    const resp = await this.apiFetch(["schemas", schemaId, "copy"], {
      init: { method: "POST" },
    });
    return resp;
  };

  public lockSchema = async (
    schemaId: Sdf.DocumentId,
    clientId: Types.ClientId,
  ): Promise<Response> => {
    const resp = await this.apiFetch(["schemas", schemaId, "lock", clientId], {
      init: { method: "PUT" },
    });
    return resp;
  };

  public unlockSchema = async (
    schemaId: Sdf.DocumentId,
    clientId: Types.ClientId,
  ): Promise<Response> => {
    const resp = await this.apiFetch(["schemas", schemaId, "lock", clientId], {
      init: { method: "DELETE" },
    });
    return resp;
  };

  public fetchWikidataValues = async (
    id: string,
  ): Promise<WikidataValues | null> => {
    // The same Wikidata labels are fetched often and they change seldom
    // (if ever), so caching is a reasonable choice.
    const resp = await this.apiFetch(["wikidata", id], {
      init: { cache: "force-cache" },
    });
    try {
      const json = await resp.json();
      json.node = id;
      return json;
    } catch (e) {
      console.error(e);
      return null;
    }
  };

  public getInductionJobs = async () => {
    const resp = await this.apiFetch(["connector", "jobs"]);
    const rows = await resp.json();
    return rows;
  };

  public submitJob = async (jobData: {
    title: string;
    raw_title: string;
    description: string;
    generated_for?: Sdf.DocumentId;
  }): Promise<Response> => {
    const newJobData = {
      ...jobData,
      status: "pending",
    };
    const resp = await this.apiFetch(["connector", "jobs"], {
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(newJobData),
      },
    });
    return resp;
  };

  public deleteJob = async (id: JobId) => {
    const resp = await this.apiFetch(["connector", "jobs", id], {
      init: {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      },
    });
    return resp;
  };
}
