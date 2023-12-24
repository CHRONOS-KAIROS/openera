/**
 * Holds and manages the application-wide state.
 *
 * Any state that does not directly relate the diagram and ReactFlow should
 * live in this store.
 *
 * @packageDocumentation
 */
import * as React from "react";
import { createContext, useContext } from "react";
import { immer } from "zustand/middleware/immer";
import { createStore, useStore } from "zustand";
import { KeyPath } from "react-json-tree";
import { applyPatches, produceWithPatches, Patch } from "immer";

import * as Sdf from "../types/Sdf";
import * as Types from "../types/Types";
import { Server } from "./Server";
import {
  getLastIri,
  makeRandomKey,
  getPath,
  makeSelectorFor,
  handleError,
} from "../app/Util";
import { Mutator } from "../app/Schema";

export interface AppProps {
  eventPrimitives: Map<string, Sdf.EventPrimitive>;
  server: Server;
}

export type AppSchemaState = "empty" | "loading" | "loaded" | "error";

export type SchemaEditState = "editable" | "locking" | "readonly";

/** Dynamic values that live in the store. */
export interface AppState {
  schemaState: AppSchemaState;
  selectedId: Sdf.DocumentId | null;
  showRawJson: boolean;
  highlightedJsonPath: KeyPath | null;
  selectedARState: string | null;
  doc: Sdf.Document | null;
  // [Forward] patches and inverse patches
  sdfPatches: Types.PatchPair[];
  docIdx: number;
  actionReady: boolean;
  stepsAreFocused: boolean;
  schemaEditState: SchemaEditState;
  schemaSaveState: Types.SchemaSaveState;
  clientId: Types.ClientId;
  mutator: Mutator;
  eventPrimitives: Map<string, Sdf.EventPrimitive>;
  server: Server;
  schemaSummaries: Map<Sdf.DocumentId, Types.SchemaSummary>;
}

/** Static actions that mutate values in the store. */
export type AppAction = {
  copySchema: (doc: Sdf.DocumentId) => Promise<void>;
  createSchema: () => Promise<void>;
  deleteSchemas: (docs: Sdf.DocumentId[]) => Promise<void>;
  editSchemaName: (doc: Sdf.DocumentId) => Promise<void>;
  getCurrentSummary: () => Types.SchemaSummary | null;
  goToJson: (atId: Sdf.AnyId) => void;
  handleMutation: (mutator: (doc: Sdf.Document) => void) => void;
  loadSchema: () => Promise<void>;
  refreshWriteLock: (date: React.MutableRefObject<Date>) => Promise<void>;
  reloadSummaries: () => Promise<void>;
  requestSchemaEditable: (editable: boolean) => Promise<void>;
  saveSchema: () => Promise<void>;
  selectSchema: (doc: Sdf.DocumentId | null) => void;
  toggleJsonView: () => void;
  undoRedoChange: (which: "undo" | "redo") => void;
};

// In milliseconds
const WRITE_LOCK_TIMEOUT = 10 * 60 * 1000;

export type AppStore = ReturnType<typeof createAppStore>;

/**
 * Use ReactContext API to handle the fact that the store must be initialized
 * with dynamically fetched data.
 */
export const AppContext = createContext<AppStore | null>(null);

/**
 * Accessing the store is not type-safe, but throwing a runtime exception
 * instead eliminates a massive amount of boilerplate.  In practice, the lack
 * of type-safety is not a problem since very little code ever runs until the
 * store is already intialized.
 */
export const useAppContext = <Subset>(
  selector: (state: AppState & AppAction) => Subset,
): Subset => {
  const store = useContext(AppContext);
  if (!store) throw new Error("AppStore is not yet initialized.");
  return useStore(store, selector);
};

export const makeAppSelector = makeSelectorFor<AppState & AppAction>();

/**
 * Initialize app store based on the props received from {@link app/AppLoader}.
 */
export const createAppStore = (props: AppProps) =>
  createStore<AppState & AppAction>()(
    /**
     * Using immer here allows us to treat everything in the store as mutable
     * while it automagically translated into immutable copy+edits which play
     * nice with React.
     */
    immer((set, get) => ({
      ...props,

      schemaState: "empty",
      selectedId: null,
      showRawJson: false,
      highlightedJsonPath: null,
      selectedARState: null,
      sdfPatches: [],
      docIdx: 0,
      doc: null,
      actions: [],
      actionReady: true,
      stepsAreFocused: false,
      schemaEditState: "readonly",
      schemaSaveState: "saved",
      clientId:
        window.location.hostname === "localhost"
          ? ("developer" as Types.ClientId)
          : (makeRandomKey() as Types.ClientId),
      schemaSummaries: new Map(),

      mutator: new Mutator(
        (m) => get().handleMutation(m),
        props.server,
        props.eventPrimitives,
      ),

      toggleJsonView: () =>
        set((s) => {
          s.showRawJson = !s.showRawJson;
        }),

      getCurrentSummary: (): Types.SchemaSummary | null => {
        const { selectedId, schemaSummaries } = get();
        if (selectedId === null) return null;
        const maybeSummary = schemaSummaries.get(selectedId);
        return maybeSummary || null;
      },

      selectSchema: (newId: Sdf.DocumentId | null): void =>
        set((state) => {
          if (state.schemaSummaries.size === 0) {
            newId = null;
          } else {
            if (newId === null)
              newId = state.schemaSummaries.keys().next().value;
          }
          state.selectedId = newId;
          state.schemaState = "empty";
          state.schemaEditState = "readonly";
          state.schemaSaveState = "saved";
          state.highlightedJsonPath = null;
          state.sdfPatches = [];
          state.docIdx = 0;
        }),

      /** Trigger the app to load the currently selected schema. */
      loadSchema: async (): Promise<void> => {
        const { selectedId } = get();
        if (selectedId === null) return;
        set((s) => {
          s.schemaState = "loading";
        });
        try {
          let doc = await props.server.getSchemaJSON(selectedId);
          set((state) => {
            state.doc = state.mutator.preprocessSchema(doc);
            state.schemaState = "loaded";
          });
        } catch (e) {
          console.error(e);
          handleError(e);
          set((s) => {
            s.schemaState = "error";
          });
        }
        const doc = get().doc;
        if (doc) {
          get()
            .mutator.doAsyncUpdates(doc)
            .then((_doc) =>
              set((draft) => {
                draft.doc = _doc;
              }),
            );
        }
      },

      requestSchemaEditable: async (wantsToEdit: boolean) => {
        const { doc, selectedId, clientId, loadSchema } = get();
        if (!doc) return;
        if (doc.ta2 === true) {
          handleError({
            title: "Cannot edit TA2 schema",
            description: "TA2 schema editing is not avaialble at this time.",
          });
          return;
        }
        if (selectedId === null) return;
        if (wantsToEdit) {
          set((s) => {
            s.schemaEditState = "locking";
          });
          try {
            await props.server.lockSchema(selectedId, clientId);
            // In case another user has edited the schema and then released the
            // lock, we need the most recent version.
            await loadSchema();
            set((s) => {
              s.schemaEditState = "editable";
            });
          } catch (e) {
            set((s) => {
              s.schemaEditState = "readonly";
            });
            handleError(e);
          }
        } else {
          props.server.unlockSchema(selectedId, clientId).catch(() => {});
          set((s) => {
            s.schemaEditState = "readonly";
          });
        }
      },

      goToJson: (atId): void => {
        const { doc } = get();
        if (!doc) return;
        let rawPath = getPath(doc, "@id", atId);
        if (rawPath === null) {
          rawPath = getPath(doc, "provenanceID", atId);
        }
        if (rawPath === null) return;

        set((draft) => {
          draft.showRawJson = true;
          draft.highlightedJsonPath = rawPath!.slice(1).concat(["root"]);
        });
      },

      handleMutation: (mutate: (d: Sdf.Document) => void): void => {
        if (get().schemaEditState !== "editable") {
          handleError({
            title: "Schema is View-Only",
            description:
              'Please switch the schema to "editable" to make modifications.',
          });
          return;
        }

        set((state) => {
          try {
            const [newDocument, forward, backward] = produceWithPatches(
              state.doc,
              mutate,
            );
            const newPatchPair = { forward, backward };
            state.docIdx += 1;
            // slice serves two purposes: first it creates a copy of the array;
            // second, if we are not at the most recent version, it will erase history
            // going forward from where we are now.
            state.sdfPatches = state.sdfPatches.slice(0, state.docIdx);
            state.sdfPatches.push(newPatchPair);
            state.doc = newDocument;
          } catch (err) {
            if (err instanceof Error)
              err.message = `During schema modification: ${err.message}`;
            handleError(err);
          }
        });

        get().saveSchema();
      },

      // Improvement: This function works most of the time but seems to skip or
      // mix together changes without any discernable pattern.
      undoRedoChange: (undoRedo: "undo" | "redo") => {
        const { sdfPatches, docIdx, schemaEditState, doc } = get();
        if (doc === null || schemaEditState !== "editable") return;
        let patch: Array<Patch>;
        let docIdxDelta: 1 | -1;
        if (undoRedo === "undo") {
          if (docIdx === 0) {
            console.warn("Cannot undo: already at earliest schema.");
            return;
          }
          docIdxDelta = -1;
          patch = sdfPatches[docIdx - 1].backward;
        } else {
          // This is not an off-by-one error. Read the method comment.
          if (docIdx === sdfPatches.length) {
            console.warn("Cannot redo: already at most recent schema.");
            return;
          }
          docIdxDelta = 1;
          patch = sdfPatches[docIdx].forward;
        }
        set((draft) => {
          draft.docIdx += docIdxDelta;
          draft.doc = applyPatches(draft.doc!, patch);
        });

        get().saveSchema();
      },

      refreshWriteLock: async (
        lastWindowFocus: React.MutableRefObject<Date>,
      ): Promise<void> => {
        const { selectedId, clientId } = get();
        if (selectedId === null) return;
        if (document.hasFocus()) lastWindowFocus.current = new Date();
        if (
          new Date().valueOf() - lastWindowFocus.current.valueOf() >
          WRITE_LOCK_TIMEOUT
        ) {
          const err = {
            title: "Schema is view-only",
            description:
              "The schema has been made view-only due to inactivity.",
          };
          handleError(err, true);
          set((s) => {
            s.schemaEditState = "readonly";
          });
        }
        try {
          await props.server.lockSchema(selectedId, clientId);
        } catch (e) {
          set((s) => {
            s.schemaEditState = "readonly";
          });
          const err = {
            title: "Schema is view-only",
            description:
              "Due to an error, the schema has been switched to view-only",
          };
          handleError(err, true);
          handleError(e);
        }
      },

      reloadSummaries: async () => {
        const { server } = get();
        try {
          const summaryList = await server.getSchemaJSONList();
          const schemaSummaries = new Map(
            summaryList.map((s) => [s.schemaId, s]),
          );
          set((s) => {
            s.schemaSummaries = schemaSummaries;
          });
        } catch (e) {
          handleError(e);
        }
      },

      createSchema: async () => {
        const { selectSchema, reloadSummaries, server } = get();
        const nameInput = prompt("Enter schema name");
        if (!nameInput) {
          alert("Schema name cannot be empty.");
          return;
        }
        try {
          const response = await server.postNewSchemaJson(nameInput);
          const { schemaId } = await response.json();
          await reloadSummaries();
          selectSchema(schemaId);
        } catch (e) {
          handleError(e);
        }
      },

      editSchemaName: async (schemaId: Sdf.DocumentId) => {
        const {
          schemaSummaries,
          selectSchema,
          reloadSummaries,
          server,
          clientId,
        } = get();
        const summary = schemaSummaries.get(schemaId);
        if (!summary) {
          console.error(`Could not find summary for ${schemaId}`);
          return;
        }
        const newname = prompt(
          "Enter new name for this schema",
          getLastIri(schemaId),
        );
        if (newname === null) return;
        else if (newname === "") alert("Schema name cannot be empty");
        try {
          const jsonBody = await server.getSchemaJSON(summary.schemaId);
          jsonBody["@id"] = jsonBody["@id"].replace(
            /[^/]*$/,
            newname,
          ) as Sdf.DocumentId;
          await server.updateSchemaJSON(summary.schemaId, clientId, jsonBody);
          selectSchema(jsonBody["@id"]);
          reloadSummaries();
        } catch (e) {
          handleError(e);
        }
      },

      saveSchema: async (): Promise<void> => {
        const { server, clientId, doc } = get();
        if (!doc) return;
        try {
          set((s) => {
            s.schemaSaveState = "saving";
          });
          await server.updateSchemaJSON(doc["@id"], clientId, doc);
          set((s) => {
            s.schemaSaveState = "saved";
          });
        } catch (e) {
          handleError(e);
          set((s) => {
            s.schemaSaveState = "save-failed";
          });
        }
        get()
          .mutator.doAsyncUpdates(get().doc!)
          .then((doc) =>
            set((draft) => {
              draft.doc = doc;
            }),
          );
      },

      deleteSchemas: async (schemaIds: Sdf.DocumentId[]): Promise<void> => {
        const {
          reloadSummaries,
          selectSchema,
          server,
          clientId,
          schemaSummaries,
        } = get();
        if (
          !window.confirm(
            "You cannot undo this action. Do you want to delete the selected files?",
          )
        ) {
          return;
        }
        try {
          const results = await Promise.allSettled(
            schemaIds.map((x) => server.deleteSchemaJSON(x, clientId)),
          );
          results
            .filter((x) => x.status === "rejected")
            .forEach((x) => handleError((x as PromiseRejectedResult).reason));
          reloadSummaries();
          const { selectedId } = get();
          if (selectedId === null || schemaIds.includes(selectedId)) {
            selectSchema(
              [...schemaSummaries.keys()].filter(
                (sid) => !schemaIds.includes(sid),
              )[0],
            );
          }
        } catch (e) {
          handleError(e);
        }
      },

      copySchema: async (schemaId: Sdf.DocumentId): Promise<void> => {
        const { reloadSummaries, selectSchema, server } = get();
        try {
          const resp = await server.copySchema(schemaId);
          reloadSummaries();
          selectSchema((await resp.json()).schemaId);
        } catch (e) {
          handleError(e);
        }
      },
    })),
  );
