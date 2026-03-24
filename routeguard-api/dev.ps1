$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

go run github.com/air-verse/air@v1.61.7 -c .air.toml
