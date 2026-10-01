param(
  [ValidateSet('sandbox', 'production')]
  [string]$Environment = 'sandbox'
)

$ErrorActionPreference = 'Stop'

$clientId = '30736'
$redirectUri = 'https://iot-componentes-bo23.onrender.com/api/shipping/oauth/callback'
$code = Read-Host 'Cole o code de autorizacao do Melhor Envio'
$secureSecret = Read-Host 'Cole o client secret do Melhor Envio' -AsSecureString
$secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureSecret)
try {
  $clientSecret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
}

$baseUrl = if ($Environment -eq 'sandbox') { 'https://sandbox.melhorenvio.com.br' } else { 'https://melhorenvio.com.br' }
$body = @{
  grant_type = 'authorization_code'
  client_id = [int]$clientId
  client_secret = $clientSecret
  redirect_uri = $redirectUri
  code = $code.Trim()
} | ConvertTo-Json

try {
  $response = Invoke-RestMethod `
    -Method Post `
    -Uri "$baseUrl/oauth/token" `
    -Headers @{
      Accept = 'application/json'
      'User-Agent' = 'IoT Componentes (suporte@iot-componentes.com.br)'
    } `
    -ContentType 'application/json' `
    -Body $body
} catch {
  $apiResponse = $_.Exception.Response
  if ($apiResponse) {
    $reader = New-Object System.IO.StreamReader($apiResponse.GetResponseStream())
    $details = $reader.ReadToEnd()
    throw "Falha ao solicitar token ($($apiResponse.StatusCode)): $details"
  }
  throw
}

if (-not $response.access_token) {
  throw 'A API não retornou access_token.'
}

$envPath = Join-Path $PSScriptRoot '..\.env'
$envText = if (Test-Path $envPath) { Get-Content $envPath -Raw } else { '' }
$lines = @(
  "MELHOR_ENVIO_TOKEN=$($response.access_token)"
  "MELHOR_ENVIO_REFRESH_TOKEN=$($response.refresh_token)"
  "MELHOR_ENVIO_BASE_URL=$baseUrl"
  'MELHOR_ENVIO_USER_AGENT=IoT Componentes (suporte@iot-componentes.com.br)'
)
$envLines = if ($envText) { $envText -split "`r?`n" } else { @() }
foreach ($line in $lines) {
  $key = $line.Split('=', 2)[0]
  $index = -1
  for ($i = 0; $i -lt $envLines.Count; $i++) {
    if ($envLines[$i] -like "$key=*") { $index = $i; break }
  }
  if ($index -ge 0) { $envLines[$index] = $line } else { $envLines += $line }
}
Set-Content -Path $envPath -Value ($envLines -join "`r`n") -NoNewline

Write-Host "Token salvo em backend/.env para o ambiente $Environment. Reinicie o backend." -ForegroundColor Green
Write-Host "Refresh token recebido: $([bool]$response.refresh_token)"
