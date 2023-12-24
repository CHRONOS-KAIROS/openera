{ self, pkgs, poetry2nix-pkg, system }:
let
  npmPackageArgs = {
    # Building will fail without these flags.
    npmFlags = [ "--legacy-peer-deps" ];
    NODE_OPTIONS = "--openssl-legacy-provider";
    # Post-NPM install, pre-Nix install
    preInstall = "npm run postinstall";
    # This hash needs to be updated everytime package-lock.json changes.  The
    # new hash can be determined by rebuilding with pkgs.lib.fakeHash and
    # observing the build failure output.
    npmDepsHash = "sha256-wEToytDEOFIGiSA1jm38rtAAmAAGxGj5mxckZk9f3rA=";
  };
  client-app-src = pkgs.nix-gitignore.gitignoreSourcePure [
      ''
        *
        !public/
        !src/
        !tsconfig.json
        !package.json
        !package-lock.json
        !patches/
        !README.md
      ''
    ] ../client;
in
with self.packages.${system};
{
  # Docker image building
  docker = import ./docker.nix { inherit self pkgs system; };

  sdf-types-deps = (poetry2nix-pkg.mkPoetryApplication {
    projectDir = ../sdf-types;
    python = pkgs.python310;
  }).dependencyEnv;

  documentation-deps-overrides = poetry2nix-pkg.overrides.withDefaults
    (self: super: {
      sphinxcontrib-jquery = super.sphinxcontrib-jquery.overridePythonAttrs
      (
        old: {
          buildInputs = (old.buildInputs or [ ]) ++ [ super.flit-core ];
        }
      );
    });

  documentation-deps = (poetry2nix-pkg.mkPoetryApplication {
    projectDir = ../docs;
    python = pkgs.python310;
    overrides = documentation-deps-overrides;
  }).dependencyEnv;

  documentation = pkgs.stdenv.mkDerivation {
    name = "openera-documentation";
    src = ../.;
    nativeBuildInputs = [ documentation-deps ];
    buildPhase = ''
      runHook preBuild
      cd docs/
      cp -r ${client-documentation} _static/client-docs
      make html
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      mv _build/html $out
      runHook postInstall
    '';
  };

  api-server = pkgs.stdenv.mkDerivation {
    name = "openera-api-server";
    # This is a trick to only include some of the (git-tracked) files in
    # a directory.
    src = pkgs.nix-gitignore.gitignoreSourcePure [
      ''
        *
        !run.sh
        !sdf-config/
      ''
    ] ../server;
    nativeBuildInputs = [
      pkgs.makeWrapper
    ];
    installPhase = ''
      mkdir -p $out/bin $out/etc
      cp run.sh $out/bin/openera
      cp -r sdf-config $out/etc
    '';
    # Make the Python dependencies available to to the run script.
    postFixup = ''
      wrapProgram $out/bin/openera \
        --prefix PATH : ${pkgs.lib.makeBinPath [
          api-server-deps
        ]}
    '';
  };

  api-server-deps = (poetry2nix-pkg.mkPoetryApplication {
    projectDir = ../server;
    python = pkgs.python310;
  }).dependencyEnv;

  client-app = pkgs.buildNpmPackage (rec {
    name = "openera-client-app";
    src = client-app-src;
    installPhase = ''
      runHook preInstall
      mkdir $out
      cp -r build/ $out
      runHook postInstall
    '';
  } // npmPackageArgs);

  client-documentation = pkgs.buildNpmPackage (rec {
    name = "openera-client-documentation";
    src = client-app-src;
    buildPhase = ''
      runHook preBuild
      npm exec -- typedoc --out build
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      cp -r build/ $out
      runHook postInstall
    '';
  } // npmPackageArgs);

  # This package is not used directly in the client application but is
  # instead using buildNpmPackage to build a node_modules directory for
  # development use.
  client-deps = pkgs.buildNpmPackage (rec {
    name = "openera-client-deps";
    src = pkgs.nix-gitignore.gitignoreSourcePure [
      ''
        *
        !package.json
        !package-lock.json
        !patches/
      ''
    ] ../client;
    dontBuild = true;
    installPhase = ''
      runHook preInstall
      mkdir $out
      cp -r node_modules/ $out
      runHook postInstall
    '';
    dontFixup = true;
  } // npmPackageArgs);
}
