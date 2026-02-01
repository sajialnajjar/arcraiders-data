import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serviceAccount = JSON.parse(
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: `${serviceAccount.project_id}.appspot.com`,
});

const bucket = admin.storage().bucket();

const imagesDir = path.join(process.cwd(), "images");

async function uploadImages() {
  if (!fs.existsSync(imagesDir)) {
    throw new Error("images folder not found");
  }

  const files = fs.readdirSync(imagesDir);

  for (const file of files) {
    const localPath = path.join(imagesDir, file);
    const remotePath = `images/${file}`;

    await bucket.upload(localPath, {
      destination: remotePath,
      public: true,
    });

    console.log(`🖼️ Uploaded image: ${file}`);
  }

  console.log("🎉 Images uploaded to Firebase Storage");
}

uploadImages().catch(err => {
  console.error("🔥 Image upload failed:", err);
  process.exit(1);
});
