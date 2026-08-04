# Reads text off images using the OCR engine built into Windows.
#
# Called by `server/src/ocr.ts`, one invocation per document rather than per
# page: starting PowerShell costs more than recognising a page, so the caller
# hands over a list and gets a list back.
#
# `-ListFile` holds one image path per line, UTF-8. Output is a JSON array of
# strings in the same order, so text containing quotes, newlines or accents
# survives the trip without a delimiter to get wrong.
param([Parameter(Mandatory = $true)][string]$ListFile)

$ErrorActionPreference = 'Stop'
# Spanish is one of the two languages installed here, so the pipe home has to
# carry more than ASCII.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]

function Await($op, $type) {
  $task = $asTaskGeneric.MakeGenericMethod($type).Invoke($null, @($op))
  $task.Wait(-1) | Out-Null
  $task.Result
}

[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) {
  Write-Error 'no OCR engine for this profile'
  exit 1
}

$out = New-Object System.Collections.ArrayList
foreach ($path in [System.IO.File]::ReadAllLines($ListFile, [System.Text.Encoding]::UTF8)) {
  if ([string]::IsNullOrWhiteSpace($path)) { continue }
  try {
    # WinRT wants a real Windows path. A forward-slash one — which is what
    # Node hands out on every platform — fails here, and returning '' for it
    # would make a broken setup look exactly like a blank page.
    $full = [System.IO.Path]::GetFullPath($path)
    $file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
    $stream = Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    [void]$out.Add([pscustomobject]@{ text = $result.Text; error = $null })
  }
  catch {
    # One unreadable page costs its own text and no more — the rule the sync
    # already follows for a file it cannot open. But it says so: a page that
    # failed and a page that is genuinely blank are different answers.
    [void]$out.Add([pscustomobject]@{ text = $null; error = $_.Exception.Message })
  }
}

# Wrapped in an object because PowerShell 5.1's ConvertTo-Json collapses a
# one-element array at the top level into a bare object, and a document with
# one page is the common case.
ConvertTo-Json -InputObject ([pscustomobject]@{ pages = @($out.ToArray()) }) -Compress -Depth 4
