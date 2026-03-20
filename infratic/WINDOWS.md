# Windows Notes

## Packaging

ServerPilot Studio now includes a Windows `nsis` target in `electron-builder.yml`.

Native module rebuild settings are enabled for Windows packaging:

- `npmRebuild: true`
- `buildDependenciesFromSource: true`
- `nativeRebuilder: sequential`

These settings are intended to rebuild native dependencies such as `keytar` and `better-sqlite3` against the Electron runtime during packaging.

If you package Windows builds from Linux, Electron Builder also requires Wine for the NSIS step. For native dependency validation, a Windows CI runner or Windows development machine is the safest path.

## SSH Agent

The current SSH agent integration uses `process.env.SSH_AUTH_SOCK` when a server is configured with `agent` authentication.

On Windows this means:

- OpenSSH agent usage works best when the Windows OpenSSH agent is running and `SSH_AUTH_SOCK` is available to the packaged app process.
- If `SSH_AUTH_SOCK` is not defined, agent authentication will not work in ServerPilot Studio even if keys are loaded elsewhere.
- PuTTY/Pageant is not auto-detected by the current implementation. Use password or private-key authentication unless your environment exposes a compatible `SSH_AUTH_SOCK`.

## Recommended Windows setup

1. Install Windows OpenSSH client features if they are not already available.
2. Start the `OpenSSH Authentication Agent` service.
3. Add keys with `ssh-add`.
4. Confirm `SSH_AUTH_SOCK` is available in the environment that launches ServerPilot Studio.

If agent auth is unreliable on a given machine, prefer the app's `privateKey` authentication mode.
