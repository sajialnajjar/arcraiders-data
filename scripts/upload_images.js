import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ===== Fix __dirname for ESM =====
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ===== Read Service Account =====
if (!process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
  throw new Error("FIREBASE_SERVICE_ACCOUNT_KEY not found");
}

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY
);

// ===== Initialize Firebase Admin with Storage =====
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "arc-raiders-wiki.firebasestorage.app",
});


const bucket = admin.storage().bucket();

// ===== Root images directory =====
const imagesRoot = path.join(process.cwd(), "images");

// ===== Helper: check image file =====
function isImage(file) {
  return /\.(png|jpg|jpeg|webp|gif)$/i.test(file);
}

// ===== Recursive upload =====
async function uploadDirectory(localDir, remoteDir) {
  const entries = fs.readdirSync(localDir, { withFileTypes: true });

  for (const entry of entries) {
    const localPath = path.join(localDir, entry.name);
    const remotePath = path.posix.join(remoteDir, entry.name);

    if (entry.isDirectory()) {
      // recurse into subfolder
      await uploadDirectory(localPath, remotePath);
    } else if (entry.isFile() && isImage(entry.name)) {
      await bucket.upload(localPath, {
        destination: remotePath,
        public: true,
        metadata: {
          cacheControl: "public, max-age=31536000",
        },
      });

      console.log(`🖼️ Uploaded: ${remotePath}`);
    }
  }
}

// ===== Run once =====
async function main() {
  if (!fs.existsSync(imagesRoot)) {
    throw new Error("images folder not found in repository root");
  }

  await uploadDirectory(imagesRoot, "images");

  console.log("🎉 All images uploaded to Firebase Storage (recursive)");
}

main().catch(err => {
  console.error("🔥 Image upload failed:", err);
  process.exit(1);
});
