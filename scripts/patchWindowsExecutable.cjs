const fs = require('fs');
const path = require('path');

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') {
    return;
  }

  const { rcedit } = await import('rcedit');
  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );
  const iconPath = path.join(context.packager.projectDir, 'resources', 'typola.ico');

  if (!fs.existsSync(exePath) || !fs.existsSync(iconPath)) {
    return;
  }

  await rcedit(exePath, {
    icon: iconPath,
  });
};
