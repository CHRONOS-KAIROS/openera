*******
OpenEra
*******

OpenEra (originally derived from "Open Eratosthenes") is the schema viewer and
curation tool developed as a part of Carnegie Mellon University's CHRONOS
KAIROS project.  It is a browser-based application backed by an API server;
this application is tested with Firefox and Chromium (Google Chrome).

Development
===========

OpenEra development is based on the `Nix <https://nixos.org/>`_ package manager
using the "flake" design pattern.  All of the instructions below will assume
you have Nix installed with flake support configured.


.. _running prod:

Running a production environment
--------------------------------

OpenEra uses Docker and Docker Compose to run in production.

Before running a production environment, it is necessary to generate some
configuration files. (The necessary tools for running this script can be
installed and activated with :command:`nix develop`.)::

  ./configure.sh

The OpenEra production runtime is based on Docker and Docker Compose.  To build
and load the Docker images, run: ::

  nix run .#build-docker-images

Once the Docker images are loaded, it is only necessary to run: ::

  docker compose up
  # or, for older versions of Docker
  docker-compose up

OpenEra can also run on top of podman and podman-compose.

OpenEra uses the hostname to detect if it is running in development mode, so do
not use ``localhost`` for testing the production environment; instead, use the
machine actual hostname or IP address (e.g., ``127.0.0.1``).


.. _running dev:

Running a development environment
---------------------------------

For development, we recommend using :command:`nix develop` or Nix with direnv
integration as it will seamlessly manage development dependencies.  To run the
development client server and TypeScript compiler, run::

  nix run .#client-server-dev

To run the development API server in Python, run::

  nix run .#api-server-dev

A working of knowledge of KAIROS's Schema Data Format or SDF is vital to
understanding both the use and development of this application.  SDF has ceased
to receive updates from the KAIROS program, and the final specification (v2.3)
is available :download:`here <./_static/sdf-v2.3-final.pdf>`.  OpenEra does not
strictly follow the official KAIROS SDF and adapts the standard as internal
needs change.  Nevertheless, it tries to keep as much compatibility as possible
with the format for the sake of interoperability with other teams.

For more detailed development documentation, see `server/README.rst <server
readme>` and `client/README.rst <client readme>`.
