/**
 * Menu for adding to, removing from, and editing a list of text items.
 *
 * @packageDocumentation
 */
import * as React from "react";

import Modal from "react-bootstrap/Modal";
import InputGroup from "react-bootstrap/InputGroup";
import FormControl from "react-bootstrap/FormControl";
import Button from "react-bootstrap/Button";
import { IconContext } from "react-icons/lib";
import { FaTimes } from "react-icons/fa";

import "../../css/Modal.css";

interface Props {
  title: string;
  initItems: string[];
  resolve: (x: string[]) => void;
  reject: () => void;
}

interface State {
  items: string[];
}

export class ListEditor extends React.Component<Props, State> {
  state = {
    items: this.props.initItems,
  };

  private updateText =
    (idx: number) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const items = [...this.state.items];
      items[idx] = e.currentTarget.value;
      this.setState({ items });
    };

  private removeItem = (idx: number) => {
    const items = [...this.state.items];
    items.splice(idx, 1);
    this.setState({ items });
  };

  componentDidMount(): void {
    this.addTrailingInput();
  }

  componentDidUpdate(): void {
    this.addTrailingInput();
  }

  /** Add an empty field to the list to allow buttonless item adding. */
  private addTrailingInput = (): void => {
    const { items } = this.state;
    if (items[items.length - 1] !== "")
      this.setState({ items: [...items].concat([""]) });
  };

  private resolve = (): void => {
    const items = [...new Set(this.state.items.filter((x) => x.length > 0))];
    this.props.resolve(items);
  };

  public render() {
    const { items } = this.state;
    const { title, reject } = this.props;

    // The remove button is not a proper button, so it can be activated using
    // the keyboard. It would be best to make this possible.
    const itemsJsx = items.map((text, idx) => (
      <InputGroup key={idx}>
        <FormControl
          placeholder="Add item"
          onChange={this.updateText(idx)}
          value={text}
        />
        <InputGroup.Append>
          <InputGroup.Text onClick={() => this.removeItem(idx)}>
            <IconContext.Provider value={{ size: "1.1em" }}>
              <FaTimes style={{ color: "red" }} title="Remove item" />
            </IconContext.Provider>
          </InputGroup.Text>
        </InputGroup.Append>
      </InputGroup>
    ));

    return (
      <Modal show={true} onHide={reject} id="listEditor" autoFocus={true}>
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {itemsJsx}
          <div id="buttonContainer">
            <Button onClick={this.resolve}>Save</Button>
          </div>
        </Modal.Body>
      </Modal>
    );
  }
}
