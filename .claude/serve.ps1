# Локальный просмотр сайта: http://localhost:8765/
# Оборачивает index.html в тот же каркас <!doctype html>, что добавляет claude.ai при публикации.
param([int]$Port = 8765)
$root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$types = @{
  ".html" = "text/html; charset=utf-8"; ".js" = "application/javascript; charset=utf-8";
  ".css" = "text/css; charset=utf-8"; ".json" = "application/json; charset=utf-8";
  ".svg" = "image/svg+xml"; ".png" = "image/png"; ".ico" = "image/x-icon"
}
$shell = '<!doctype html><html><head><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style></head><body>'
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  try {
    $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath)
    if ($ctx.Request.HttpMethod -eq "POST" -and $path -eq "/__save") {
      # запись выгрузки банка (bank/*.csv) и правок (frontend/subjects/table.js) со страницы tools/bank.html
      $rel = $ctx.Request.QueryString["path"]
      if ($rel -notmatch '^(bank/[A-Za-z0-9._-]+\.csv|frontend/subjects/table\.js)$') {
        $ctx.Response.StatusCode = 403
        $bytes = [Text.Encoding]::UTF8.GetBytes("path not allowed")
      } else {
        $ms = New-Object IO.MemoryStream
        $ctx.Request.InputStream.CopyTo($ms)
        $dest = Join-Path $root ($rel -replace "/", "\")
        New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null
        [IO.File]::WriteAllBytes($dest, $ms.ToArray())
        $bytes = [Text.Encoding]::UTF8.GetBytes($rel + " (" + $ms.Length + " bytes)")
      }
      $ctx.Response.ContentType = "text/plain; charset=utf-8"
    } elseif ($path -eq "/" -or $path -eq "/index.html" -or $path -eq "/landing" -or $path -eq "/brandbook" -or $path -eq "/fees") {
      $page = [IO.File]::ReadAllText((Join-Path $root "frontend\index.html"), [Text.Encoding]::UTF8)
      $bytes = [Text.Encoding]::UTF8.GetBytes($shell + $page + "</body></html>")
      $ctx.Response.ContentType = "text/html; charset=utf-8"
    } else {
      $relPath = $path.TrimStart("/") -replace "/", "\"
      $full = [IO.Path]::GetFullPath((Join-Path $root $relPath))
      if (-not ($full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf))) {
        $full = [IO.Path]::GetFullPath((Join-Path (Join-Path $root "frontend") $relPath))
      }
      if (-not $full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $full -PathType Leaf)) {
        $ctx.Response.StatusCode = 404
        $bytes = [Text.Encoding]::UTF8.GetBytes("not found")
      } else {
        $bytes = [IO.File]::ReadAllBytes($full)
        $ext = [IO.Path]::GetExtension($full).ToLower()
        if ($types.ContainsKey($ext)) { $ctx.Response.ContentType = $types[$ext] }
      }
    }
    $ctx.Response.Headers.Add("Cache-Control", "no-store")
    $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
  } catch {
    $ctx.Response.StatusCode = 500
  } finally {
    $ctx.Response.Close()
  }
}
