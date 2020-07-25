import { promises as fs } from 'fs'


export async function filesMustExist(attachment, mustExist = true) {
  const filePaths = [
    attachment.getPath(),
    ...Object.keys(attachment.imageSizes)
      .filter((s) => s !== 'o')
      .map((s) => attachment.getResizedImagePath(s)),
  ];

  await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        await fs.stat(filePath);

        if (!mustExist) {
          throw new Error(`File should not exist: ${filePath}`);
        }
      } catch (err) {
        if (mustExist && (err.code === 'ENOENT')) {
          throw new Error(`File should exist: ${filePath}`);
        } else if ((err.code !== 'ENOENT') || mustExist) {
          throw err;
        }
      }
    })
  );
}
