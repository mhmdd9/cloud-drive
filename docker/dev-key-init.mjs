import { randomBytes } from "node:crypto";
import {
  constants,
  chmodSync,
  closeSync,
  fchmodSync,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";

const directory = "/kms";
const destination = `${directory}/master.key`;
const keyId = "clouddrive-dev";
const prefix = `${keyId}:`;

function validateExisting() {
  const descriptor = openSync(
    destination,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.uid !== 0 || stat.size !== prefix.length + 44) {
      throw new Error();
    }
    const content = readFileSync(descriptor);
    const text = content.toString("utf8");
    const encoded = text.slice(prefix.length);
    const key = Buffer.from(encoded, "base64");
    if (
      !text.startsWith(prefix) ||
      !/^[A-Za-z0-9+/]{43}=$/.test(encoded) ||
      key.length !== 32 ||
      key.toString("base64") !== encoded ||
      !Buffer.from(text, "utf8").equals(content)
    ) {
      throw new Error();
    }
    fchmodSync(descriptor, 0o600);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

try {
  if (process.getuid?.() !== 0) {
    throw new Error();
  }
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.uid !== 0 || (stat.mode & 0o022) !== 0) {
    throw new Error();
  }
  if (
    process.env.S3_KMS_KEY_ID !== undefined &&
    process.env.S3_KMS_KEY_ID !== `arn:aws:kms:${keyId}`
  ) {
    throw new Error();
  }

  let exists = true;
  try {
    lstatSync(destination);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
    exists = false;
  }

  if (!exists) {
    const temporaryDirectory = mkdtempSync(`${directory}/.key-init-`);
    try {
      chmodSync(temporaryDirectory, 0o700);
      const temporaryKey = `${temporaryDirectory}/master.key`;
      const descriptor = openSync(temporaryKey, "wx", 0o600);
      try {
        writeFileSync(descriptor, `${prefix}${randomBytes(32).toString("base64")}`);
        fchmodSync(descriptor, 0o600);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      try {
        linkSync(temporaryKey, destination);
      } catch (error) {
        if (error.code !== "EEXIST") {
          throw error;
        }
      }
      const directoryDescriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY);
      try {
        fsyncSync(directoryDescriptor);
      } finally {
        closeSync(directoryDescriptor);
      }
    } finally {
      rmSync(temporaryDirectory, { recursive: true });
    }
  }

  validateExisting();
} catch {
  process.stderr.write("Development KMS key initialization failed; existing key material was not replaced.\n");
  process.exitCode = 1;
}
