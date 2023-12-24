**************
Nix in OpenEra
**************

This page will explain the basic role of Nix in OpenEra.  Nix is a build and
deployment system that focuses on reproducibility.  A tutorial of Nix is beyond
the scope of this documentation (check `Learn Nix
<https://nixos.org/learn.html>`_ and `Nix flakes
<https://nixos.wiki/wiki/Flakes>`_ instead).  Nix is used in place of a build
tool like Make and in conjunction with tools like Poetry and NPM.  Nix helps to
provide project-wide dependency management in a way similar to what NPM does
for Node projects.  Ensure that Nix is installed on the development machine
with flakes configured.


Structure
=========

* ``flake.nix`` defines the Nix configuration for the entire project; all other
  Nix files are incorporated here.
* ``nix/packages.nix`` defines the main components of the project and how they
  are built.
* ``nix/docker.nix`` defines how to assemble the Docker images for the
  production environment; these files replace a traditional ``Dockerfile``.
* ``nix/shell.nix`` defines a shell environment for development; this can be
  manually activated with :command:`nix develop` or integrated with `direnv
  <https://github.com/nix-community/nix-direnv>`_.
* ``nix/apps.nix`` defines the project-level "run scripts" for development.


Building
========

In some cases, it make sense to write the derivation for a package from scratch
using ``mkDerivation`` when the build process is relatively simple or is
primarily just an assembly of previous packages.  In cases of more complicated
builds, we use existing Nix infrastructure to aid the build process.


API Server (Python)
-------------------
The API server is built using `Poetry <https://python-poetry.org/>`_ with the
Nix build using `poetry2nix <https://github.com/nix-community/poetry2nix>`_.
In order to manage Python packages, use :command:`poetry` or edit the
``pyproject.toml`` files as one would for a normal Poetry project.  Make sure
that the ``poetry.lock`` file is updated if editing ``pyproject.toml`` as
poetry2nix uses this in building the corresponding Nix package.  If poetry2nix
fails to build one of the packages, it might be due to a missing build
dependency (see `this note
<https://github.com/nix-community/poetry2nix/blob/master/docs/edgecases.md>`_
on poetry2nix).  This issue is slated to be fixed in a more recent version of
Poetry will eventually make its way to poetry2nix.

Since building the Nix package for the server is relatively quick,
:command:`nix run .#api-server-dev` will build the entire Nix package and
execute the run script directly in the ``server/`` directory.  The gunicorn
server is able to reload code changes without entirely restarting allowing for
a fast development cycle while still getting an environment as close to
production as possible.


Client (TypeScript)
-------------------
The client is built using Create React App, NPM, and ``buildNpmPackage``.
``node2nix`` was tried initially but resulted in build problems.  All package
management happens as normal via :command:`npm`.  If the ``package-lock.json``
file changes, it will be necessary to update the ``npmDepsHash`` inside of
``nix/packages.nix`` file in order for the build to complete (namely, the build
will fail after the change and just use the new hash the error message
provides).

Since the ``buildNpmPackage`` takes much longer than the Nix Python package
build, we do not run the client app directly for development.  Instead, we use
Nix to build all of the dependencies and store them in a ``node_modules/``
directory with symlinks to the Nix store.  From here we can use Create React
App's :command:`npm start` to run a development friendly server locally.


Docker
------
The Docker images are built using nixpkgs' ``dockerTools``.  This is method of
building images is far simpler and more robust than building an image with
a ``Dockerfile``.  This is because is Nix automatically installs *only* the
required dependencies without needing a base image.  If a container needs to be
debugged, it is recommended to add BusyBox to give you some basic programs to
work with.


Tips
====

* Nix flakes only see files that tracked by Git.  If Nix is not finding a file,
  ensure that it is tracked by Git (i.e., run :command:`git add`); changes to
  the file do not need to be committed.
* Nix will always rebuild packages whenever the input files change; structuring
  derivations so that they only see files they truly depend on will eliminate
  unnecessary rebuilding.
* If you do not like Nix and wish to develop the project Nix-free, it should be
  as easy as using Poetry and NPM directly to manage the codebase, although
  beware of the version of Poetry and NPM you are using as such version
  mismatch drove me to use Nix in the first place.

  * If you wish to make OpenEra _completely_ Nix-free, you will have to write
    Dockerfiles to build the Docker images since Nix does this more or less
    automatically currently.
