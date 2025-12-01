{
  pkgs ? import <nixpkgs> { },
}:

let
  xcodebuild-clean = pkgs.writeShellScriptBin "xcodebuild" ''
    # Run xcodebuild with clean environment, bypassing nix toolchain
    exec env -i \
      PATH="/Applications/Xcode.app/Contents/Developer/usr/bin:/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin:/usr/bin:/bin" \
      DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer" \
      /Applications/Xcode.app/Contents/Developer/usr/bin/xcodebuild "$@"
  '';
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs
    xcodebuild-clean
  ];

  # Use Xcode SDK for Swift compilation instead of nix SDK
  shellHook = ''
    unset SDKROOT
    export DEVELOPER_DIR="/Applications/Xcode.app/Contents/Developer"
  '';
}
