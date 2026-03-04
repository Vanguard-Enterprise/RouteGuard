# Build RouteGuard device images locally and upload to RustFS.
# Requires: Docker Desktop, and mc.exe in PATH (https://min.io/docs/minio/linux/reference/minio-mc.html)
#
# Usage:
#   .\build-device-images.ps1                    # build both, upload
#   .\build-device-images.ps1 -Target arm64      # ARM64 only
#   .\build-device-images.ps1 -Target x86-64     # x86-64 only
#   .\build-device-images.ps1 -SkipUpload        # build but don't upload
#
# Set RustFS credentials as env vars or pass as parameters:
#   $env:RUSTFS_ENDPOINT   = "https://storage.route-guard.com"
#   $env:RUSTFS_ACCESS_KEY = "..."
#   $env:RUSTFS_SECRET_KEY = "..."

param(
    [ValidateSet("arm64", "x86-64", "both")]
    [string]$Target = "both",

    [string]$Endpoint   = $env:RUSTFS_ENDPOINT,
    [string]$AccessKey  = $env:RUSTFS_ACCESS_KEY,
    [string]$SecretKey  = $env:RUSTFS_SECRET_KEY,

    [switch]$SkipUpload
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BuildCtx  = Join-Path $ScriptDir "device\build"
$OutDir    = Join-Path $ScriptDir "device\output"

New-Item -ItemType Directory -Force -Path "$OutDir\arm64"  | Out-Null
New-Item -ItemType Directory -Force -Path "$OutDir\x86-64" | Out-Null

function Check-Docker {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Error "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
    }
    $info = docker info 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Docker daemon is not running. Start Docker Desktop and try again."
    }
}

function Build-ARM64 {
    Write-Host "`n==> Building ARM64 image (Docker build context: device/build)" -ForegroundColor Cyan

    $env:DOCKER_BUILDKIT = "0"
    docker build -t rg-build-arm64 -f "$BuildCtx\arm64\Dockerfile" $BuildCtx
    if ($LASTEXITCODE -ne 0) { Write-Error "docker build arm64 failed" }

    $outPath = (Resolve-Path "$OutDir\arm64").Path
    docker run --rm --privileged `
        -v "${outPath}:/pi-gen/deploy" `
        rg-build-arm64
    if ($LASTEXITCODE -ne 0) { Write-Error "docker run arm64 failed" }

    $img = Get-ChildItem "$OutDir\arm64\*arm64*.img.gz" | Select-Object -First 1
    if (-not $img) { Write-Error "No arm64 image found in $OutDir\arm64" }
    Write-Host "==> ARM64 image: $($img.FullName) ($([math]::Round($img.Length/1MB, 1)) MB)" -ForegroundColor Green
    return $img.FullName
}

function Build-X8664 {
    Write-Host "`n==> Building x86-64 image (Docker build context: device/build)" -ForegroundColor Cyan

    $env:DOCKER_BUILDKIT = "0"
    docker build -t rg-build-x86 -f "$BuildCtx\x86-64\Dockerfile" $BuildCtx
    if ($LASTEXITCODE -ne 0) { Write-Error "docker build x86-64 failed" }

    $outPath = (Resolve-Path "$OutDir\x86-64").Path
    docker run --rm --privileged `
        -v /dev:/dev `
        -v "${outPath}:/output" `
        rg-build-x86
    if ($LASTEXITCODE -ne 0) { Write-Error "docker run x86-64 failed" }

    $img = Get-ChildItem "$OutDir\x86-64\routeguard-latest.img.gz" | Select-Object -First 1
    if (-not $img) { Write-Error "No x86-64 image found in $OutDir\x86-64" }
    Write-Host "==> x86-64 image: $($img.FullName) ($([math]::Round($img.Length/1MB, 1)) MB)" -ForegroundColor Green
    return $img.FullName
}

function Upload-Image {
    param([string]$LocalPath, [string]$RemotePath)

    if ($SkipUpload) { Write-Host "==> Skipping upload (-SkipUpload)" ; return }

    if (-not $Endpoint -or -not $AccessKey -or -not $SecretKey) {
        Write-Warning "RustFS credentials not set - skipping upload."
        Write-Warning "Set RUSTFS_ENDPOINT, RUSTFS_ACCESS_KEY, RUSTFS_SECRET_KEY env vars."
        return
    }

    if (-not (Get-Command mc -ErrorAction SilentlyContinue)) {
        Write-Warning "mc.exe not found - skipping upload."
        Write-Warning "Download from: https://dl.min.io/client/mc/release/windows-amd64/mc.exe"
        Write-Warning "Place mc.exe in your PATH, then re-run."
        return
    }

    mc alias set rg $Endpoint $AccessKey $SecretKey 2>$null
    mc cp $LocalPath "rg/$RemotePath"
    if ($LASTEXITCODE -ne 0) { Write-Error "Upload failed for $LocalPath" }
    Write-Host "==> Uploaded to rg/$RemotePath" -ForegroundColor Green
}

# Main

Check-Docker

switch ($Target) {
    "arm64" {
        $img = Build-ARM64
        Upload-Image $img "device-images/arm64/routeguard-latest.img.gz"
    }
    "x86-64" {
        $img = Build-X8664
        Upload-Image $img "device-images/x86-64/routeguard-latest.img.gz"
    }
    "both" {
        $arm = Build-ARM64
        $x86 = Build-X8664
        Upload-Image $arm "device-images/arm64/routeguard-latest.img.gz"
        Upload-Image $x86 "device-images/x86-64/routeguard-latest.img.gz"
    }
}

Write-Host "`n==> Done" -ForegroundColor Green
