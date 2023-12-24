/**
 * Defines application-wide types excluding SDF types.
 *
 * @packageDocumentation
 */
// Schema Types

import { Patch } from "immer";

import * as Sdf from "./Sdf";

// Misc Types

export type EventStatus = "matched" | "predicted" | "not-predicted" | "graphg";

export type WithPatches<T> = [T, Patch[], Patch[]];

/**
 * A ClientId is not just any string. Using tagged types like these allow the
 * typechecker to ensure that a plain string does not get treated as a
 * `ClientId` unless we explicit annotated it as such (e.g., `s as ClientId`).
 *
 * These act like Haskell newtypes. We may want to implement a more robust
 * solution: https://github.com/Microsoft/TypeScript/issues/4895#issuecomment-401067935
 */
export type ClientId = string & { readonly __tag: unique symbol };
export type ClientVersion = string & { readonly __tag: unique symbol };

export interface SchemaSummary {
  schemaId: Sdf.DocumentId;
  tags: string[];
}

export type PatchPair = { forward: Patch[]; backward: Patch[] };

export type SchemaSaveState = "saved" | "saving" | "save-failed";

export interface DocumentPreview {
  fileName: string;
  preview: string;
  note: string;
}

export interface TextDocument {
  fileName: string;
  content: string;
  note: string;
}
