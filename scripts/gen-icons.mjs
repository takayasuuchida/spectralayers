import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#000000"/>
  <text x="256" y="290" font-family="Georgia, serif" font-size="120" font-weight="700" fill="#c9a64e" text-anchor="middle" letter-spacing="8">viverce</text>
  <text x="256" y="380" font-family="Arial, sans-serif" font-size="42" font-weight="400" fill="#9a9aa2" text-anchor="middle" letter-spacing="3">つけ回し</text>
</svg>`;

const buf = Buffer.from(svg);

await sharp(buf).resize(192, 192).png().toFile("public/pwa-192.png");
await sharp(buf).resize(512, 512).png().toFile("public/pwa-512.png");
await sharp(buf).resize(180, 180).png().toFile("public/apple-touch-icon.png");
await sharp(buf).resize(32, 32).png().toFile("public/favicon-32.png");
console.log("icons generated");
