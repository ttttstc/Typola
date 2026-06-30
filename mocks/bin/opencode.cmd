@echo off
set TYPOLA_MOCK_AGENT=opencode
node "%~dp0\..\mock-agent.mjs" %*
