import { spawn } from 'node:child_process';

/**
 * The native "Select Folder" dialog, served by the process that has the
 * folders. A browser deliberately never reveals an absolute path — both
 * `webkitdirectory` and `showDirectoryPicker()` hide it — so the frictionless
 * picker has to come from this side, and this server runs on the user's own
 * machine in their own session.
 *
 * Windows-only on purpose, the OCR engine's precedent (D-059): the dialog is
 * Windows' modern IFileOpenDialog in folder mode — Quick Access, OneDrive,
 * search — not WinForms' tree. The typed path in the reading panel stays as
 * the fallback everywhere this cannot show.
 *
 * The dialog is owned by whatever window is foreground when it opens — the
 * user just clicked "+" in their browser, so it fronts above that click
 * rather than flashing in the taskbar behind it.
 */

export type Picked = { path: string } | { cancelled: true } | { error: string };

/** How long a person may browse before the request gives up on them. */
export const PICK_TIMEOUT_MS = 300_000;

/**
 * Printed by the script on a deliberate cancel, parsed here — one word two
 * sides must agree on. A real answer is always an absolute path, which can
 * never collide with a bare word.
 */
const CANCEL_SENTINEL = 'CANCELLED';

const CSHARP = `
using System;
using System.Runtime.InteropServices;

public static class FolderPicker {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();

  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  private class FileOpenDialogRCW { }

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IFileDialog {
    [PreserveSig] uint Show(IntPtr hwndParent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint fos);
    void SetDefaultFolder(IntPtr psi);
    void SetFolder(IntPtr psi);
    void GetFolder(out IntPtr ppsi);
    void GetCurrentSelection(out IntPtr ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IntPtr ppsi);
    void AddPlace(IntPtr psi, uint fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
  }

  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  private interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IntPtr ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IntPtr psi, uint hint, out int piOrder);
  }

  public static string Pick(string title) {
    var dialog = (IFileDialog)new FileOpenDialogRCW();
    uint options;
    dialog.GetOptions(out options);
    // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM: folders only, real paths only.
    dialog.SetOptions(options | 0x20u | 0x40u);
    dialog.SetTitle(title);
    uint hr = dialog.Show(GetForegroundWindow());
    if (hr == 0x800704C7u) return null; // the user said no; that is an answer
    if (hr != 0) Marshal.ThrowExceptionForHR((int)hr);
    IntPtr item;
    dialog.GetResult(out item);
    var shellItem = (IShellItem)Marshal.GetObjectForIUnknown(item);
    IntPtr pszName;
    shellItem.GetDisplayName(0x80058000u, out pszName); // SIGDN_FILESYSPATH
    string path = Marshal.PtrToStringUni(pszName);
    Marshal.FreeCoTaskMem(pszName);
    return path;
  }
}
`;

/**
 * UTF-8 out before anything prints: redirected PowerShell 5.1 stdout uses the
 * OEM codepage by default, which mangles every accented character this
 * machine's locale puts in folder names.
 */
const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @'
${CSHARP}
'@
$picked = [FolderPicker]::Pick('Choose a folder for this level to read')
if ($null -eq $picked) { Write-Output '${CANCEL_SENTINEL}' } else { Write-Output $picked }
`;

/**
 * The last non-empty stdout line is the answer — Add-Type may chat above it —
 * and a non-zero exit is the script's own failure, told with its stderr.
 */
export function parsePickOutput(stdout: string, code: number | null, stderr: string): Picked {
  if (code !== 0) {
    const detail = stderr.trim().split(/\r?\n/).filter(Boolean).pop();
    return { error: `the folder dialog failed${detail ? ` — ${detail}` : ''}` };
  }
  const answer = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .pop();
  if (!answer) return { error: 'the folder dialog closed without an answer' };
  if (answer === CANCEL_SENTINEL) return { cancelled: true };
  return { path: answer };
}

/** Spawns the dialog and waits for the person. Injectable so tests never open one. */
async function runDialog(): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve) => {
    // -EncodedCommand sidesteps every quoting rule a heredoc would die on.
    const encoded = Buffer.from(SCRIPT, 'utf16le').toString('base64');
    const child = spawn('powershell.exe', ['-NoProfile', '-Sta', '-EncodedCommand', encoded], {
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString('utf8')));
    const timer = setTimeout(() => {
      child.kill();
      resolve({ stdout: '', stderr: `nobody picked within ${PICK_TIMEOUT_MS / 60000} minutes`, code: 1 });
    }, PICK_TIMEOUT_MS);
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout: '', stderr: err.message, code: 1 });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, code });
    });
  });
}

/** One dialog at a time: a second "+" while one is open is a mistake, not a queue. */
let open = false;

/**
 * Whether this install can show the dialog at all (#30).
 *
 * Exported so the desk can ask BEFORE it offers the button, which is the same
 * fault #24 found one layer up: an install that cannot do a thing was letting
 * the work be started and refusing it afterwards. A hosted install has no
 * desktop, so an organize sentence there can never reach a folder — and D-132
 * is deliberate that there is no typed-path fallback in the app, so this is a
 * refusal and not a detour.
 *
 * `pickFolder` reads the same function rather than repeating the condition:
 * a desk that offers and a dialog that refuses is two answers to one question
 * (D-032).
 */
export function pickFolderAvailable(platform: NodeJS.Platform = process.platform): boolean {
  return platform === 'win32';
}

/**
 * Why the dialog cannot be shown here, as the *dialog's own* answer — what
 * `pickFolder` returns when it is asked on a machine that has none. It reaches
 * a caller through the route's reply, and the one surface that can act on it
 * is the reading panel, which takes a folder as text. Exported for its test.
 */
export const NO_PICKER = 'the folder dialog needs Windows — type the path instead';

/**
 * …and the whole sentence the desk says when an organize job cannot be started
 * here at all (#30).
 *
 * Whole, not a clause: the server owns what the client renders (PROJECT.md),
 * and the review of this ticket found the browser composing the first half at
 * two separate sites — the D-030 shape, in the one change that was otherwise
 * careful about it.
 *
 * Separate from `NO_PICKER` because the work bar has no text box to fall back
 * to — D-132 is deliberate that a folder is picked and never typed — so "type
 * the path instead" is advice with nowhere to act on it. The first live hosted
 * run put exactly that on screen.
 */
export const NO_ORGANIZE_HERE =
  'organizing needs a folder picked on this machine, and this install has no desktop to open a folder dialog on';

export async function pickFolder(run: typeof runDialog = runDialog): Promise<Picked> {
  if (!pickFolderAvailable()) {
    return { error: NO_PICKER };
  }
  if (open) return { error: 'a folder dialog is already open — finish that one first' };
  open = true;
  try {
    const result = await run();
    return parsePickOutput(result.stdout, result.code, result.stderr);
  } finally {
    open = false;
  }
}
