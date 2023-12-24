{ pkgs, self, system }:
with self.packages.${system}; {
  # Make a Nix-built version of node_modules available for development.
  build-node-deps = {
    type = "app";
    # Simply symlinking the whole node_modules directory does not work because
    # npm has to create and write to some additional directories under
    # node_modules.
    program = toString (pkgs.writeScript "" ''
      rm -rf node_modules
      mkdir node_modules
      shopt -s dotglob
      for f in ${client-deps}/node_modules/*; do
        ln -s $f node_modules/
      done
    '');
  };

  client-server-dev = {
    type = "app";
    program = toString (pkgs.writeScript "" ''
      cd ./client
      ${self.apps.${system}.build-node-deps.program}
      export NODE_OPTIONS=--openssl-legacy-provider
      export BROWSER=none
      npm start
    '');
  };

  api-server-dev = {
    type = "app";
    program = toString (pkgs.writeScript "" ''
      cd ./server
      ${api-server}/bin/openera dev
    '');
  };

  build-docker-images = {
    type = "app";
    program = toString (pkgs.writeScript "" ''
      sudo true  # Nice password prompt
      ${docker.api-server} | sudo docker load
      ${docker.client-server} | sudo docker load
    '');
  };
}
