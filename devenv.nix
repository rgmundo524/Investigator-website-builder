{ config, lib, pkgs, ... }:

let
  # devenv scripts are executable commands, usable from Fish and noninteractive runs.
  npmCommand = command: ''
    cd ${lib.escapeShellArg config.devenv.root}
    exec npm ${command} "$@"
  '';
in
{
  packages = [ pkgs.git pkgs.fish ];

  env = {
    # Quoted paths stay outside the Nix store. Override locally or with -O.
    SITE_DATA_DIR = lib.mkDefault "templates/investigator-site";
    TAILSCALE_HOSTNAME = lib.mkDefault "";
  };

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_24;
    npm = {
      enable = true;
      # Install locked packages on activation. npm's predev also checks for
      # lockfile changes when git pull happens inside an already-open shell.
      install.enable = true;
    };
  };

  scripts.site-setup.exec = npmCommand "ci";
  scripts.site-dev.exec = npmCommand "run dev --";
  scripts.site-check.exec = npmCommand "run check --";
  scripts.site-build.exec = npmCommand "run build --";
  scripts.site-drafts.exec = npmCommand "run build:drafts --";
  scripts.site-export.exec = npmCommand "run content:export --";
  scripts.site-init.exec = npmCommand "run site:init --";
  scripts.site-template.exec = npmCommand "run site:template --";
  scripts.site-package.exec = npmCommand "run site:package --";
  scripts.site-editor.exec = npmCommand "run editor --";

  processes.site.exec = "site-dev";
}
