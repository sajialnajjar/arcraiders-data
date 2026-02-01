import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== 1. Read Service Account from ENV =====
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

// ===== 3. Upload JSON to Firestore (Object + Array safe) =====
async function uploadCollection(collectionName, data) {
  const colRef = db.collection(collectionName);
  let batch = db.batch();
  let operationCount = 0;

  const commitBatch = async () => {
    if (operationCount > 0) {
      await batch.commit();
      batch = db.batch();
      operationCount = 0;
    }
  };

  // Case 1: JSON is an Array
  if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      if (typeof item !== "object" || item === null) continue;

      const docId = item.id?.toString() || i.toString();
      batch.set(colRef.doc(docId), item);
      operationCount++;

      if (operationCount === 450) {
        await commitBatch();
      }
    }
  }
  // Case 2: JSON is an Object
  else if (typeof data === "object") {
    for (const [key, value] of Object.entries(data)) {
      if (typeof value !== "object" || value === null) continue;

      batch.set(colRef.doc(key), value);
      operationCount++;

      if (operationCount === 450) {
        await commitBatch();
      }
    }
  }
  // Unsupported JSON format
  else {
    throw new Error(`Unsupported JSON format in ${collectionName}`);
  }

  await commitBatch();
  console.log(`✅ Uploaded: ${collectionName}`);
}

// ===== 4. Load JSON files from repository root =====
const dataDir = process.cwd();

async function main() {
  const files = fs
    .readdirSync(dataDir)
    .filter(file => file.endsWith(".json"));

  if (files.length === 0) {
    throw new Error("No JSON files found in repository root");
  }

  for (const file of files) {
    const collectionName = file.replace(".json", "");
    const filePath = path.join(dataDir, file);
    const jsonData = JSON.parse(fs.readFileSync(filePath, "utf8"));

    await uploadCollection(collectionName, jsonData);
  }

  console.log("🎉 Firestore sync completed successfully");
}

main().catch(err => {
  console.error("🔥 Sync failed:", err);
  process.exit(1);
});
