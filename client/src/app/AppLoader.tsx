/**
 * Bootstraps the main application
 *
 * {@link "components/AppContent"} needs data from the server before it can run, so
 * wrapping it can simplify the logic by handling all of the loading beforehand
 * (e.g., not handling `null`s).
 *
 * Currently, if anything fails in the loading process, the browser app is just
 * permanently in an error state and the user must referesh the page.
 * A periodic auto-refresh could be implemented to better recover from
 * temporary outages on the server side.
 *
 * @packageDocumentation
 */
import * as React from "react";

import { Server } from "./Server";
import { AppContent } from "../components/AppContent";
import { AppProps } from "./Store";

import "../css/App.css";

type LoaderState = "normal" | "error";

/**
 * This component stores all of the main app's props as a state since it will
 * need to initialize the main app. We use `Partial` here since they will
 * uninitialized at first.
 */
type State = Partial<AppProps> & {
  loaderState: LoaderState;
};

export class AppLoader extends React.Component<{}, State> {
  public constructor(props: {}) {
    super(props);
    this.state = { loaderState: "normal" };
  }

  private handleError = (e: any): void => {
    console.error(e);
    this.setState({ loaderState: "error" });
  };

  public componentDidMount(): void {
    // Right now, the Create React App server just returns a garbage
    // HTML page when /client-version is not present (i.e., in the
    // dev environment).  The API server in dev mode will just ignore
    // this, but if something changes, it might be necessary to
    // handle it in this logic.
    Server.getClientVersion()
      .then((cv) => {
        const server = new Server(cv);
        this.setState({ server });
      })
      .catch(this.handleError);
  }

  public componentDidUpdate(): void {
    const { server, eventPrimitives, loaderState } = this.state;
    if (server && loaderState !== "error") {
      if (!eventPrimitives)
        server
          .getEventPrimitives()
          .then((ep) => this.setState({ eventPrimitives: ep }))
          .catch(this.handleError);
    }
  }

  public render() {
    const { eventPrimitives, server, loaderState } = this.state;

    if (eventPrimitives && server) {
      return <AppContent eventPrimitives={eventPrimitives} server={server} />;
    } else {
      return (
        <div id="appLoaderDefault">
          {loaderState === "error"
            ? "An error occurred while loading OpenEra."
            : "Loading..."}
        </div>
      );
    }
  }
}
