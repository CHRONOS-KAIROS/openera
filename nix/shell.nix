{ self, pkgs, poetry2nix-pkg, system }:
pkgs.mkShell rec {
  python-envs = map (
    dir: poetry2nix-pkg.mkPoetryEnv {
      projectDir = dir;
      overrides = self.packages.${system}.documentation-deps-overrides;
    }
  ) [
    ./../server
    ./../sdf-types
    ./../docs
  ];

  NODE_OPTIONS = "--openssl-legacy-provider";
  BROWSER = "none";
  ERA_MODE = "dev";

  packages = with pkgs; [
    apacheHttpd
    jq
    nixpkgs-fmt
    nodePackages.npm
    nodejs
    openssl
    python-envs
    poetry
    sqlite
    yq
  ];
}
