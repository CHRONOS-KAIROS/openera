/**
 * Table-style menu for selecting and managing schemas
 *
 * This component provides an interface for all schema modification that is not
 * directly tied to the current schema. {@link components/ButtonBar} provides
 * an interface for interacting with the currently selected schema.
 *
 * @packageDocumentation
 */
import * as React from "react";

import Table from "react-bootstrap/Table";
import DropdownButton from "react-bootstrap/DropdownButton";
import Dropdown from "react-bootstrap/Dropdown";
import { produce } from "immer";

import "../css/SchemaLibraryMenu.css";
import { Server } from "../app/Server";
import { dialogManagerRef } from "./DialogManager";
import { getLastIri } from "../app/Util";
import * as Sdf from "../types/Sdf";
import * as Types from "../types/Types";

import { makeAppSelector, useAppContext } from "../app/Store";
import { handleError } from "../app/Util";

const propSelector = makeAppSelector([
  "schemaSummaries",
  "selectedId",
  "selectSchema",
  "createSchema",
  "editSchemaName",
  "deleteSchemas",
  "reloadSummaries",
  "copySchema",
  "clientId",
  "eventPrimitives",
  "server",
  "mutator",
]);

type Props = ReturnType<typeof propSelector>;

type SortByKey = "date_added" | "name";
const sortByKeys: Array<SortByKey> = ["date_added", "name"];
type SortByMapping<Value> = {
  [Property in SortByKey]: Value;
};

type Summary = Types.SchemaSummary;

export const SchemaLibraryMenu = () => {
  const props = useAppContext(propSelector);
  return <SchemaLibraryMenuBase {...props} />;
};

interface State {
  filterTags: Set<string>;
  sortBy: SortByKey;
}

class SchemaLibraryMenuBase extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      filterTags: new Set(),
      sortBy: "date_added",
    };
  }

  private makeCbId = (schemaId: Sdf.DocumentId): string =>
    `schemaNavCb-${schemaId}`;
  private makeLinkId = (schemaId: Sdf.DocumentId): string =>
    `schemaNavLink-${schemaId}`;

  /**
   * Remove tags from the filter which no longer exist on any schema.
   */
  private pruneTags = (): void => {
    const newTags = new Set(this.state.filterTags);
    const allTags = new Set(
      [...this.props.schemaSummaries.values()].flatMap((s) => s.tags),
    );
    this.state.filterTags.forEach((tag) => {
      if (!allTags.has(tag)) newTags.delete(tag);
    });
    if (newTags.size !== this.state.filterTags.size)
      this.setState({ filterTags: newTags });
  };

  public componentDidUpdate() {
    this.pruneTags();
  }

  private getSelectedIds = () =>
    [...this.props.schemaSummaries.values()]
      .map((s) => document.getElementById(this.makeCbId(s.schemaId)))
      .filter((x) => x)
      .filter((_cb) => {
        const cb = _cb as HTMLInputElement;
        const checked = cb.checked;
        cb.checked = false;
        return checked;
      })
      .map((cb) => (cb as HTMLInputElement).value as Sdf.DocumentId);

  private toggleAllSelected = (): void => {
    const { schemaSummaries } = this.props;
    const toState = this.getSelectedIds().length === 0;
    [...schemaSummaries.keys()]
      .map((k) => this.makeCbId(k))
      .map((elId) => document.getElementById(elId))
      .filter((x) => x)
      .forEach((el) => ((el as HTMLInputElement).checked = toState));
  };

  private editTags = async (): Promise<void> => {
    const ids = this.getSelectedIds();
    const { server, schemaSummaries, clientId } = this.props;
    const tags = new Set(
      ids.flatMap((x) => schemaSummaries.get(x)!.tags || []),
    );
    try {
      const newTags = await dialogManagerRef.editTags([...tags]);
      const results = await Promise.allSettled(
        ids.map((fn) => server.updateSchemaTags(fn, clientId, newTags)),
      );
      results
        .filter((r) => r.status === "rejected")
        .forEach((r) => handleError((r as PromiseRejectedResult).reason));
      this.props.reloadSummaries();
      const { selectedId, selectSchema } = this.props;
      if (selectedId !== null && ids.includes(selectedId))
        selectSchema(selectedId);
    } catch (e) {}
  };

  private editSchemaNames = (): void =>
    this.getSelectedIds().forEach((x) =>
      this.props.editSchemaName(x).then(() => {
        if (this.props.selectedId === x) this.props.selectSchema(x);
      }),
    );

  private copySchemas = () =>
    this.getSelectedIds().forEach(this.props.copySchema);

  private deleteSchemas = () => this.props.deleteSchemas(this.getSelectedIds());

  private copySchemaNames = (): void => {
    const schemaIds = this.getSelectedIds();
    const copyTargetEl = document.getElementById(
      "schemaNavCopyTarget",
    ) as HTMLInputElement;
    copyTargetEl.value = schemaIds
      .map((s) => getLastIri(this.props.schemaSummaries.get(s)!.schemaId))
      .join("\n");
    copyTargetEl.select();
    document.execCommand("copy");
  };

  private downloadsSchemas = (): void =>
    this.getSelectedIds().forEach((s) =>
      document.getElementById(this.makeLinkId(s))!.click(),
    );

  private fixSchemas = () =>
    this.getSelectedIds().map(async (id) => {
      let sdfFile = await this.props.server.getSchemaJSON(id);
      sdfFile = this.props.mutator.preprocessSchema(sdfFile);
      sdfFile = await this.props.mutator.doAsyncUpdates(sdfFile);
      await this.props.server.updateSchemaJSON(
        id,
        this.props.clientId,
        sdfFile,
      );
    });

  private packageSchemas = async (): Promise<void> => {
    const schemaIds = this.getVisibleIds();
    const name = this.state.filterTags.values().next().value || "library";
    let data;
    try {
      data = await this.props.server.getPackagedSchemas(name, schemaIds);
    } catch (e) {
      handleError(e);
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data]));
    const schemaName = JSON.parse(data)["@id"].split("/").slice(-1)[0];
    link.download = `${schemaName}.json`;
    document.body.append(link);
    link.click();
    link.remove();
  };

  private getVisibleIds = (): Array<Sdf.DocumentId> =>
    [...this.props.schemaSummaries.values()]
      .filter((s) =>
        Array.from(this.state.filterTags).every((t) => s.tags.includes(t)),
      )
      .map((x) => x.schemaId);

  private packageSchemasZip = async (): Promise<void> => {
    const schemaIds = this.getVisibleIds();
    const name = this.state.filterTags.values().next().value || "library";
    let data;
    try {
      data = await this.props.server.getZippedSchemas(schemaIds);
    } catch (e) {
      handleError(e);
      return;
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([data]));
    link.download = `${name}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
  };

  private toggleTag = (tag: string): void =>
    this.setState((state) => {
      const filterTags = new Set(state.filterTags);
      if (state.filterTags.has(tag)) filterTags.delete(tag);
      else filterTags.add(tag);
      return { ...state, filterTags };
    });

  /** Upload schema JSON files using individual HTTP requests. */
  private uploadSchemas = async (fileList: FileList): Promise<void> => {
    const files = [...fileList];
    const { clientId, server } = this.props;
    const schemas = (await Promise.all(files.map((f) => f.text()))).map((t) => {
      let json = JSON.parse(t) as Sdf.Document;
      if (json["@id"].match(/\/([^/]+)$/)?.at(1) === "TA2") {
        json = produce((j: Sdf.Document) => {
          j["@id"] = `TA2-${j.version}-${j.ceID}` as Sdf.DocumentId;
        })(json);
      }
      try {
        return this.props.mutator.preprocessSchema(json);
      } catch (e) {
        return json;
      }
    });
    server.uploadSchemaJson(schemas, clientId).then((resps) => {
      this.props.reloadSummaries();
      for (let i = 0; i < resps.length; ++i) {
        // Suggestion: These should use proper type guards
        if (resps[i].status === "fulfilled" && (resps[i] as any).value === null)
          handleError(`"${files[i].name}" is not a valid file.`);
        else if (resps[i].status === "rejected") {
          const rejected = resps[i] as PromiseRejectedResult;
          if (rejected.reason.status === 409) {
            const shouldOverwrite = window.confirm(
              `The schema in file "${files[i].name}" already exists. Would you like to overwrite the server-side copy?`,
            );
            if (shouldOverwrite) {
              server.uploadSchemaJson([schemas[i]], clientId, true);
            }
          } else {
            handleError((resps[i] as any).reason);
          }
        }
      }
    });
  };

  private summaryComparers: SortByMapping<(x: Summary, y: Summary) => number> =
    {
      name: (x: Summary, y: Summary) => {
        const xName = getLastIri(x.schemaId).toLowerCase();
        const yName = getLastIri(y.schemaId).toLowerCase();
        return xName.localeCompare(yName);
      },
      // Default sort order
      date_added: (x: Summary, y: Summary) => 0,
    };

  public render() {
    const { schemaSummaries, selectedId } = this.props;
    const tags = Array.from(this.state.filterTags);

    const jsons = [...schemaSummaries.values()]
      .filter((s) => tags.every((t) => s.tags.includes(t)))
      .sort(this.summaryComparers[this.state.sortBy])
      .map((summary) => {
        const jsonUrl = Server.makeServerUrl([
          "api",
          "schemas",
          summary.schemaId,
        ]);
        const schemaNameClass =
          "schemaName" +
          (selectedId === summary.schemaId ? "Selected" : "Unselected");
        const nameElId = `snd-${summary.schemaId}`;
        return (
          <tr key={summary.schemaId}>
            <td className="checkboxTd">
              <input
                type="checkbox"
                id={this.makeCbId(summary.schemaId)}
                value={summary.schemaId}
              />
              <a
                id={this.makeLinkId(summary.schemaId)}
                style={{ display: "none" }}
                href={jsonUrl}
                target="_blank"
                rel="noreferrer noopener"
                download
              >
                {jsonUrl}
              </a>
            </td>
            <td
              className={schemaNameClass + " schemaName"}
              onClick={() => this.props.selectSchema(summary.schemaId)}
            >
              {getLastIri(summary.schemaId)}
              <input
                id={nameElId}
                style={{
                  position: "absolute",
                  // We just want this out of sight since copying to clipboard
                  // doesn't work if display: none
                  left: "-1000px",
                  top: "-1000px",
                }}
                value={getLastIri(summary.schemaId)}
                readOnly
              />
            </td>
          </tr>
        );
      });

    const importFileInput = (
      <input
        type="file"
        id="schemaImport"
        accept=".json"
        style={{ display: "none" }}
        multiple
        onChange={() => {
          const el = document.getElementById(
            "schemaImport",
          ) as HTMLInputElement;
          if (el?.files) {
            this.uploadSchemas(el.files);
            el.value = "";
          }
        }}
      />
    );

    const schemaTags = new Set<string>();
    for (const summary of schemaSummaries.values())
      summary.tags.forEach((t) => schemaTags.add(t));
    const schemaTagsEls =
      schemaTags.size > 0 ? (
        Array.from(schemaTags)
          .sort()
          .map((tag) => (
            <Dropdown.Item
              onClick={() => this.toggleTag(tag)}
              active={this.state.filterTags.has(tag)}
              key={tag}
            >
              {tag}
            </Dropdown.Item>
          ))
      ) : (
        <Dropdown.Item disabled>
          <i>No tags found</i>
        </Dropdown.Item>
      );

    const sortButtons = sortByKeys.map((k) => (
      <Dropdown.Item
        key={k}
        active={k === this.state.sortBy}
        onClick={() => this.setState({ sortBy: k })}
      >
        {k
          .split("_")
          .map((w) => w[0].toUpperCase() + w.slice(1))
          .join(" ")}
      </Dropdown.Item>
    ));

    return (
      <>
        <textarea
          id="schemaNavCopyTarget"
          style={{
            position: "absolute",
            // We just want this out of sight since copying to clipboard
            // doesn't work if display: none
            left: "-1000px",
            top: "-1000px",
          }}
          readOnly
        />
        <div id="schemaNavHeader">
          <div id="schemaNavTitle">Schemas</div>
          <DropdownButton variant="outline-success" title="File">
            <Dropdown.Item onClick={() => this.props.createSchema()}>
              New Schema
            </Dropdown.Item>
            <Dropdown.Item
              onClick={() => document.getElementById("schemaImport")?.click()}
            >
              Upload Schema
            </Dropdown.Item>
            <Dropdown.Item onClick={this.copySchemas}>
              Duplicate Selected
            </Dropdown.Item>
            <Dropdown.Item onClick={this.downloadsSchemas}>
              Download Selected as JSON
            </Dropdown.Item>
            <Dropdown.Item onClick={this.packageSchemasZip}>
              Download All as ZIP
            </Dropdown.Item>
            <Dropdown.Item onClick={this.packageSchemas}>
              Download All as Library
            </Dropdown.Item>
            <Dropdown.Item onClick={this.deleteSchemas}>
              Delete Selected
            </Dropdown.Item>
          </DropdownButton>
          <DropdownButton variant="outline-danger" title="Actions">
            <Dropdown.Item onClick={this.toggleAllSelected}>
              Select All
            </Dropdown.Item>
            <Dropdown.Item onClick={this.copySchemaNames}>
              Copy Name
            </Dropdown.Item>
            <Dropdown.Item onClick={this.editSchemaNames}>
              Edit Name
            </Dropdown.Item>
            <Dropdown.Item onClick={this.editTags}>Edit Tags</Dropdown.Item>
            <Dropdown.Item onClick={this.fixSchemas}>Fix Schema</Dropdown.Item>
          </DropdownButton>
          <DropdownButton
            variant={tags.length ? "primary" : "outline-primary"}
            title="Filter"
          >
            {schemaTagsEls}
          </DropdownButton>
          <DropdownButton variant="outline-primary" title="Sort By">
            {sortButtons}
          </DropdownButton>
          {importFileInput}
        </div>
        <div id="schemaNavBody">
          <Table striped bordered id="schemaNavTable">
            <tbody>{jsons}</tbody>
          </Table>
          <p>
            Is the schema you are looking for missing? OpenEra may have
            discovered invalid formatting. Please check the{" "}
            <a
              href={Server.makeServerUrl(["api", "quarantine"])}
              target="_blank"
              rel="noreferrer"
            >
              quarantined schemas
            </a>
            .
          </p>
        </div>
      </>
    );
  }
}
