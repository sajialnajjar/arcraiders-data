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

// ===== 3. Upload JSON to Firestore =====
async function uploadCollection(collectionName, data) {
  const batch = db.batch();
  const colRef = db.collection(collectionName);

  for (const [id, value] of Object.entries(data)) {
    batch.set(colRef.doc(id), value);
  }

  await batch.commit();
  console.log(`✅ Uploaded: ${collectionName}`);
}

// ===== 4. Load data files =====
const dataDir = path.join(process.cwd(), "data");

async function main() {
  if (!fs.existsSync(dataDir)) {
    throw new Error("data folder not found");
  }

  const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));

  for (const file of files) {
    const name = file.replace(".json", "");
    const content = JSON.parse(
      fs.readFileSync(path.join(dataDir, file), "utf8")
    );

    await uploadCollection(name, content);
  }

  console.log("🎉 Firestore sync completed");
}

main().catch(err => {
  console.error("🔥 Sync failed:", err);
  process.exit(1);
});
