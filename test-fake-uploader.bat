@echo off
:: Fake image uploader for testing Typola upload command flow.
:: Takes any number of image path args, prints one fake URL per image.
:: First line is a log to verify Typola only reads the LAST N lines.
echo Upload Success:
:loop
if "%~1"=="" goto :end
for %%F in ("%~1") do echo https://fake.cdn/uploaded/%%~nxF
shift
goto loop
:end
