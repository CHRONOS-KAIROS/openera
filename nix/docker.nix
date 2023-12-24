{ self, system, pkgs }:
let
  nginx-files = pkgs.stdenv.mkDerivation {
    name = "openera-nginx-conf";
    src = ../nginx;
    dontbuild = true;
    installPhase = "mkdir -p $out/app; cp * $out/app";
  };
in
with self.packages.${system};
{
  client-server =
    pkgs.dockerTools.streamLayeredImage {
      name = "openera-client-server";
      tag = "latest";
      contents = [
        nginx-files
        pkgs.nginx
        pkgs.dockerTools.fakeNss
      ];
      config = {
        Cmd = [ "nginx" "-c/app/nginx.conf" ];
        WorkingDir = "/app";
      };
      extraCommands = ''
        #!${pkgs.runtimeShell}
        mkdir var/www
        cp -r ${client-app}/build/. var/www/
        echo -n ${client-app.src} > var/www/client-version
        cp -r ${documentation} var/www/docs
        mkdir -p etc/nginx var/cache/nginx var/log/nginx tmp/
        cp -r ${pkgs.nginx}/conf etc/nginx/
      '';
    };

  api-server =
    pkgs.dockerTools.streamLayeredImage {
      name = "openera-api-server";
      tag = "latest";
      contents = [ api-server pkgs.coreutils ];
      extraCommands = ''
        #!${pkgs.runtimeShell}
        mkdir -p app/fsdb
        ln -s ${api-server}/etc/* app
        echo -n ${client-app.src} > app/client-version
      '';
      config = {
        Cmd = [ "${api-server}/bin/openera" ];
        WorkingDir = "/app";
      };
    };
}
