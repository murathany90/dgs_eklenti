# Native Messaging · v6.1.2

Protocol version: **1.0**. Host name: `com.ytbs.powerfactory.solver`. The Python package pins pandapower **3.5.5**. The installer creates a virtual environment, installs the package and registers the generated executable `ytbs-solver-host.exe` in `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.ytbs.powerfactory.solver`. It writes `com.ytbs.powerfactory.solver.json` with the current extension ID in `allowed_origins`; it does not create a `.cmd` launcher.

The application displays its current `chrome.runtime.id` and prepares this PowerShell command:

```powershell
.\native-host\python\scripts\install-windows.ps1 -ExtensionId <CURRENT_EXTENSION_ID>
```

Run it from the repository root, fully close and reopen Chrome, then use **Bağlantıyı test et**. The connection test exchanges only `HELLO` and `CAPABILITIES`; it reports protocol, engine and engine version without sending a model. Remove the registration with `./native-host/python/scripts/uninstall-windows.ps1`.

Messages use Chrome's little endian 32-bit byte length frame and UTF-8 JSON. Every message has `protocolVersion`, `requestId` and `jobId`. Commands: `HELLO`, `CREATE_MODEL`, `MODEL_CHUNK`, `MODEL_COMPLETE`, `PREFLIGHT`, `RUN_LOAD_FLOW`, `PING`, `CANCEL`. Responses: `CAPABILITIES`, `PROGRESS`, `DIAGNOSTICS`, `RESULT_SUMMARY`, `RESULT_CHUNK`, `PONG`, `ERROR`. The solver reports `SOLVING_AC` or `SOLVING_DC` immediately before calling pandapower. It reports real job phases and elapsed time; it does not manufacture iteration percentages. Model chunks are 128 KiB and result chunks are 192 KiB. Length, order, SHA-256, version and job correlation are checked. The host accepts no path, URL, shell or Python code commands.

Host failures are separated into unregistered host, extension-origin mismatch, start failure, disconnect, crash, protocol error, solver-reported error and timeout. An unknown failure before connection is reported as a start failure, never as proof that the host is uninstalled.

**Cancellation limitation:** `CANCEL` is handled between synchronous host commands. Once `pandapower.runpp` or `rundcpp` starts, the native host's command loop cannot read a cancellation message until the solve returns. This release has no cancel button and does not claim to interrupt an active solver process. The extension times out after five minutes and closes its native port.

Models and results remain local to the browser and native host. Browser Approx output is not relabeled as a pandapower result.
