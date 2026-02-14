import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ===== Fix __dirname for ESM =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== 1. Read Service Account =====
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not found");
}

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY
);

// ===== 2. Initialize Firebase Admin =====
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// ===== 3. Deep sanitize object for Firestore =====
function sanitize(value) {
  if (Array.isArray(value)) {
    return value
      .map(v => sanitize(v))
      .filter(v => v !== undefined);
  }

  if (value !== null && typeof value === "object") {
    const clean = {};
    for (const [key, val] of Object.entries(value)) {
      if (!key || key.trim() === "") continue;
      const sanitized = sanitize(val);
      if (sanitized !== undefined) {
        clean[key] = sanitized;
      }
    }
    return clean;
  }

  return value;
}

// ===== 4. Upload JSON to Firestore safely =====
async function uploadCollection(collectionName, data) {
  const colRef = db.collection(collectionName);
  let batch = db.batch();
  let ops = 0;

  const commit = async () => {
    if (ops > 0) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  const writeDoc = async (id, obj) => {
    const cleanData = sanitize(obj);
    if (
      !cleanData ||
      typeof cleanData !== "object" ||
      Object.keys(cleanData).length === 0
    ) {
      return;
    }

    batch.set(colRef.doc(id), cleanData);
    ops++;

    if (ops >= 450) {
      await commit();
    }
  };

  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (typeof item !== "object" || item === null) continue;
      const id = item.id?.toString() || i.toString();
      await writeDoc(id, item);
    }
  } else if (typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (!key || key.trim() === "") continue;
      if (typeof value !== "object" || value === null) continue;
      await writeDoc(key, value);
    }
  } else {
    throw new Error(`Unsupported JSON format in ${collectionName}`);
  }

  await commit();
  console.log(`✅ Uploaded: ${collectionName}`);
}

// ===== 5. Upload folder JSON files as collection =====
async function uploadFolderAsCollection(folderName) {
  const folderPath = path.join(process.cwd(), folderName);

  if (!fs.existsSync(folderPath)) {
    console.log(`⚠️ Folder not found: ${folderName}`);
    return;
  }

  const files = fs
    .readdirSync(folderPath)
    .filter(f => f.endsWith(".json"));

  for (const file of files) {
    const docId = file.replace(".json", "");
    const filePath = path.join(folderPath, file);
    const jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));

    await uploadCollection(folderName, {
      [docId]: jsonData,
    });
  }
}

// ===== 6. Main =====
async function main() {
  // Root JSON files
  const rootFiles = fs
    .readdirSync(process.cwd())
    .filter(f => f.endsWith(".json"));

  for (const file of rootFiles) {
    if (["package.json", "package-lock.json"].includes(file)) continue;

    const name = file.replace(".json", "");
    const content = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), file), "utf8")
    );

    await uploadCollection(name, content);
  }

  // Folder-based collections
  const folders = ["items", "quests", "hideout", "map-events"];

  for (const folder of folders) {
    await uploadFolderAsCollection(folder);
  }

  console.log("🎉 Firestore sync completed successfully");
}

// ===== 7. Run =====
main().catch(err => {
  console.error("🔥 Sync failed:", err);
  process.exit(1);
});
