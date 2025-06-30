@echo on
REM Run from the repo root, regardless of where Git called us.
pushd "%~dp0\.."
REM Call the Node script with any arguments Git passes through.
node ".githooks\post_commit.js" %*
popd
