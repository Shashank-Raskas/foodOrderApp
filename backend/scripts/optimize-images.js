/**
 * Image Optimization Script
 * 
 * Resizes all meal images to 400px width (card view) and compresses to 80% quality.
 * Original images are backed up to public/images/originals/
 * 
 * Run: node scripts/optimize-images.js
 */

import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';

const IMAGES_DIR = path.resolve('public/images');
const BACKUP_DIR = path.resolve('public/images/originals');
const TARGET_WIDTH = 400;
const QUALITY = 80;

async function optimizeImages() {
  // Create backup dir
  await fs.mkdir(BACKUP_DIR, { recursive: true });

  const files = await fs.readdir(IMAGES_DIR);
  const jpgFiles = files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));

  console.log(`Found ${jpgFiles.length} images to optimize...\n`);

  let totalOriginal = 0;
  let totalOptimized = 0;

  for (const file of jpgFiles) {
    const srcPath = path.join(IMAGES_DIR, file);
    const backupPath = path.join(BACKUP_DIR, file);

    const stat = await fs.stat(srcPath);
    // Skip if it's a directory
    if (stat.isDirectory()) continue;

    // Backup original
    await fs.copyFile(srcPath, backupPath);

    const originalSize = stat.size;
    totalOriginal += originalSize;

    // Optimize: resize to TARGET_WIDTH, keep aspect ratio, compress
    const outputBuffer = await sharp(srcPath)
      .resize(TARGET_WIDTH, null, { withoutEnlargement: true })
      .jpeg({ quality: QUALITY, progressive: true })
      .toBuffer();

    await fs.writeFile(srcPath, outputBuffer);

    const newSize = outputBuffer.length;
    totalOptimized += newSize;

    const savings = ((1 - newSize / originalSize) * 100).toFixed(1);
    console.log(
      `  ${file}: ${(originalSize / 1024).toFixed(0)}KB → ${(newSize / 1024).toFixed(0)}KB (${savings}% smaller)`
    );
  }

  console.log(`\n✓ Done! ${jpgFiles.length} images optimized.`);
  console.log(`  Total: ${(totalOriginal / 1024).toFixed(0)}KB → ${(totalOptimized / 1024).toFixed(0)}KB`);
  console.log(`  Saved: ${((totalOriginal - totalOptimized) / 1024).toFixed(0)}KB (${((1 - totalOptimized / totalOriginal) * 100).toFixed(1)}%)`);
  console.log(`  Originals backed up to: ${BACKUP_DIR}`);
}

optimizeImages().catch(console.error);
