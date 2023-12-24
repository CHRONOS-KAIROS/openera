/**
 * Menu for incrementally searching through a list of items.
 *
 * @packageDocumentation
 */
import * as React from "react";

import Modal from "react-bootstrap/Modal";
import InputGroup from "react-bootstrap/InputGroup";
import FormControl from "react-bootstrap/FormControl";
import ListGroup from "react-bootstrap/ListGroup";

import "../../css/Modal.css";

interface Props {
  title: string;
  items: [string, unknown][];
  resolve: (key: unknown) => void;
  reject: () => void;
  returnNoMatch?: boolean;
}

interface State {
  query: string;
}

export class Search extends React.Component<Props, State> {
  private queryInput: React.RefObject<HTMLInputElement>;

  public constructor(props: Props) {
    super(props);
    this.state = {
      query: "",
    };
    this.queryInput = React.createRef();
  }

  private updateFilter = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.setState({ query: e.currentTarget.value });
  };

  componentDidMount(): void {
    // Improvement: Do not use setTimeout.
    if (this.queryInput.current)
      setTimeout(() => this.queryInput.current!.focus());
  }

  public render() {
    const { query } = this.state;
    const { title, items, resolve, reject, returnNoMatch } = this.props;
    const regExp = new RegExp(query, "i");
    const isMatch = (x: string) => x.match(regExp);
    const itemToJsx = ([label, key]: [string, unknown]) => (
      <ListGroup.Item key={label} action onClick={() => resolve(key)}>
        {label}
      </ListGroup.Item>
    );
    const filteredItems = items
      .filter((x) => isMatch(x[0]))
      .map(itemToJsx)
      .sort();
    const noMatchItem = returnNoMatch ? (
      <ListGroup.Item
        key="_default"
        action
        onClick={query === "" ? () => {} : () => resolve(query)}
      >
        <i>{query === "" ? "Type to search or add" : `Use "${query}"`}</i>
      </ListGroup.Item>
    ) : (
      <ListGroup.Item>
        <i>No matches</i>
      </ListGroup.Item>
    );

    return (
      <Modal
        show={true}
        onHide={reject}
        className="modalSearch"
        autoFocus={false}
      >
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <InputGroup style={{ marginBottom: "2em" }}>
            <FormControl
              onKeyPress={(e: React.KeyboardEvent<HTMLInputElement>) => {
                if (e.key === "Enter") {
                  if (filteredItems.length) {
                    filteredItems[0].props.onClick();
                  } else if (noMatchItem && query !== "") {
                    noMatchItem.props.onClick();
                  }
                }
              }}
              placeholder="Type to filter"
              onChange={this.updateFilter}
              ref={this.queryInput}
            />
          </InputGroup>
          <ListGroup>
            {!returnNoMatch ? filteredItems : filteredItems.concat(noMatchItem)}
          </ListGroup>
        </Modal.Body>
      </Modal>
    );
  }
}
