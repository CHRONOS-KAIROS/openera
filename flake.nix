{
  description = "Schema curation tool for the KAIROS-CHRONOS project";

  inputs = {
    nixpkgs.url = "nixpkgs";
    flake-utils.url = "github:numtide/flake-utils";
    # poetry2nix is already present in nixpkgs, but explicitly including it as
    # an input allows us to use an up-to-date version with all available fixes.
    poetry2nix = {
      url = "github:nix-community/poetry2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, poetry2nix }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
        poetry2nix-pkg = poetry2nix.legacyPackages.${system};
      in
      with self.packages.${system};
      {
        # Scripts
        apps = import ./nix/apps.nix { inherit self pkgs system; };
        # Development environment
        devShells.default = import ./nix/shell.nix { inherit self pkgs poetry2nix-pkg system; };
        # Generic builds
        packages = import ./nix/packages.nix { inherit self pkgs poetry2nix-pkg system; };
      }
    );
}
