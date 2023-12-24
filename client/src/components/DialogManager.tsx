/**
 * Centralized component for managing modal user interactions
 *
 * This component serves as an abstraction so that other components in the
 * application can simply call {@link getEventPrimitive} or something of the
 * like without having to manage React state or display logic.
 *
 * @packageDocumentation
 */

import * as React from "react";

import { Search } from "./dialogs/Search";
import { ListEditor } from "./dialogs/ListEditor";
import { makeAppSelector, useAppContext } from "../app/Store";
import * as Sdf from "../types/Sdf";

type WhichModal = "aRState" | "relation" | "event" | "link" | "tags" | null;

interface State {
  whichModal: WhichModal;
  /**
   * Since the (argument) type of `resolve` varies, we set it to
   * `never` so that function arguments of all types can be assigned to it, but
   * we have to cast it explicitly before using it.
   */
  resolve: ((x: never) => void) | null;
  reject: (() => void) | null;
  tagsToEdit: string[] | null;
}

const propSelector = makeAppSelector(["eventPrimitives", "mutator"]);

type Props = ReturnType<typeof propSelector>;

// Wrapping this we can use Zustand without having to rewrite the class
// component.
export const DialogManager = () => {
  const state = useAppContext(propSelector);
  return (
    <DialogManagerBase
      eventPrimitives={state.eventPrimitives}
      mutator={state.mutator}
    />
  );
};

export let dialogManagerRef: DialogManagerBase;

class DialogManagerBase extends React.Component<
  ReturnType<typeof propSelector>,
  State
> {
  constructor(props: Props) {
    super(props);
    this.state = {
      whichModal: null,
      resolve: null,
      reject: null,
      tagsToEdit: null,
    };
    // Suggestion: Put some kind of protection here?
    dialogManagerRef = this;
  }

  public promptEditText = (
    propName: string,
    currentValue: string,
    mutation: (x: string) => void,
  ): void => {
    const newText = prompt(`Enter new ${propName}`, currentValue);
    if (newText === null) return;
    mutation(newText);
  };

  public promptAddStep = async (): Promise<void> => {
    // Suggestion: Make name prompt async
    const newname = prompt(`Enter new event name`, `event`);
    if (newname !== null && !newname.match(/^[a-zA-Z0-9 ]+$/)) {
      alert("Please only use: letters, numbers, spaces");
      return;
    } else if (newname === null) {
      return;
    }
    const ta1explanation = prompt("Enter a ta1explanation");
    if (ta1explanation === null) return;
    const description = prompt("Enter a description");
    if (description === null) return;
    let primitive;
    try {
      primitive = await this.getEventPrimitive();
    } catch (e) {
      return;
    }
    this.props.mutator.addEvent(
      newname,
      ta1explanation,
      description,
      primitive,
    );
  };

  public promptAddArg = async (): Promise<void> => {
    // Suggestion: Make name prompt async
    const name = prompt("Enter name");
    if (!name) return;
    const wd_node = prompt("Enter WikiData Node");
    if (!wd_node) return;
    this.props.mutator.addEntity(name, wd_node as Sdf.WdNode);
  };

  /**
   * A synchronous getter has the type () => string, but since we are doing
   * this async'ly, the type is () => Promise<string>. The first part of the
   * promise sets the state with the resolve/reject for the modal dialogue.
   * After the user selects and option or clicks "X", the promise will resolve
   * or reject. We close the dialog and pass the result (if resolved) to f for
   * postprocessing (e.g., derefencing it with a map).
   */
  private makeAyncPrompt =
    <A, B>(name: WhichModal, f: (a: A) => B) =>
    (): Promise<B> =>
      new Promise<A>((resolve, reject) => {
        this.setState({ whichModal: name, resolve, reject });
      })
        .then(f)
        .finally(() =>
          this.setState({ whichModal: null, resolve: null, reject: null }),
        );

  public getEventPrimitive = this.makeAyncPrompt<
    Sdf.EventPrimitiveId,
    Sdf.EventPrimitive
  >("event", (id) => this.props.eventPrimitives.get(id)!);

  private _editTags = this.makeAyncPrompt<string[], string[]>("tags", (x) => x);

  public editTags = async (tagList: string[]) => {
    this.setState({ tagsToEdit: tagList });
    const result = await this._editTags();
    this.setState({ tagsToEdit: null });
    return result;
  };

  public render() {
    const { whichModal, resolve, reject, tagsToEdit } = this.state;
    const { /*relationPrimitives,*/ eventPrimitives } = this.props;
    let title = "";
    let items: [string, unknown][] = [];
    let returnNoMatch = false;
    let showSearchModal = true;
    switch (whichModal) {
      case "event":
        title = "Select an Event Type";
        items = Array.from(eventPrimitives.entries()).map((x) => [
          `${x[1].wd_label} (${x[0]})`,
          x[0],
        ]);
        items.unshift(["null", null]);
        break;
      default:
        showSearchModal = false;
    }
    const searchModal = !showSearchModal ? null : (
      <Search
        title={title}
        items={items}
        resolve={resolve! as (x: unknown) => void}
        reject={reject!}
        returnNoMatch={returnNoMatch}
      />
    );

    const listEditor =
      whichModal === "tags" && tagsToEdit !== null ? (
        <ListEditor
          initItems={this.state.tagsToEdit!}
          title={"Edit Schema Tags"}
          resolve={resolve! as (x: string[]) => void}
          reject={reject!}
        />
      ) : null;

    return (
      <>
        {searchModal}
        {listEditor}
      </>
    );
  }
}
