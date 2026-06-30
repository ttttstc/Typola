@echo off
set TYPOLA_MOCK_AGENT=codex
node "%~dp0\..\mock-agent.mjs" %*
