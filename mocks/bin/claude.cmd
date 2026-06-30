@echo off
set TYPOLA_MOCK_AGENT=claude
node "%~dp0\..\mock-agent.mjs" %*
