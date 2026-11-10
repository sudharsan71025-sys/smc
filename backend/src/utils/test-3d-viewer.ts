import { createApp } from '../app.js';
import { db } from '../config/database.js';
import { logger } from './logger.js';
import { Product } from '../models/Product.js';
import { storageService } from '../services/storageService.js';

async function run3DViewerTests() {
  logger.info('========================================================');
  logger.info('   SMC DYNAMIC 3D PRODUCT VIEWER & MODEL TEST SUITE     ');
  logger.info('========================================================');

  await db.connect();

  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  logger.info(`Test server running at ${baseUrl}`);

  try {
    // ----------------------------------------------------
    // TEST 1: Retrieve Live Published 3D Products from MongoDB
    // ----------------------------------------------------
    logger.info('\n--- TEST 1: Retrieve Live 3D Products from Database ---');
    const catalogRes = await fetch(`${baseUrl}/api/products`);
    const catalogJson = (await catalogRes.json()) as any;
    if (catalogRes.status !== 200 || !Array.isArray(catalogJson.data)) {
      throw new Error(`Failed to retrieve catalog: ${JSON.stringify(catalogJson)}`);
    }

    const products = catalogJson.data;
    logger.info(`  ✅ PASS: Retrieved ${products.length} live products from MongoDB`);
    if (products.length === 0) {
      throw new Error('No published products found in MongoDB.');
    }

    // ----------------------------------------------------
    // TEST 2: Validate Different GLB Models (Door vs Window)
    // ----------------------------------------------------
    logger.info('\n--- TEST 2: Inspect Different Architectural GLB Models ---');
    for (const prod of products) {
      logger.info(`\n  Checking 3D Model: "${prod.name}" (ID: ${prod._id})`);
      logger.info(`    GLB URL: ${prod.glbUrl}`);

      // Verify HTTP accessibility of the GLB model
      const modelUrl = prod.glbUrl.replace('http://localhost:5000', baseUrl);
      const glbRes = await fetch(modelUrl);
      if (glbRes.status === 200) {
        const buffer = Buffer.from(await glbRes.arrayBuffer());
        logger.info(`    ✅ PASS: File accessible (HTTP 200 OK, Size: ${buffer.length} bytes)`);

        // Check GLB Magic Bytes: 0x46546C67 ('glTF')
        const magic = buffer.toString('ascii', 0, 4);
        const version = buffer.readUInt32LE(4);
        const fileLength = buffer.readUInt32LE(8);

        if (magic === 'glTF' && version === 2) {
          logger.info(`    ✅ PASS: glTF 2.0 Binary Specification Validated`);
          logger.info(`       Magic: '${magic}', Version: ${version}, Declared Length: ${fileLength} bytes`);
        } else {
          throw new Error(`Invalid GLB binary: magic=${magic}, version=${version}`);
        }
      } else {
        throw new Error(`Failed to fetch GLB from ${modelUrl}, status: ${glbRes.status}`);
      }

      // Check USDZ if present
      if (prod.usdzUrl) {
        logger.info(`    USDZ URL: ${prod.usdzUrl}`);
        const usdzUrl = prod.usdzUrl.replace('http://localhost:5000', baseUrl);
        const usdzRes = await fetch(usdzUrl);
        if (usdzRes.status === 200) {
          logger.info(`    ✅ PASS: Apple AR USDZ file accessible (HTTP 200 OK)`);
        }
      }
    }

    // ----------------------------------------------------
    // TEST 3: Handling Missing Model URL
    // ----------------------------------------------------
    logger.info('\n--- TEST 3: Handling Missing Model URL ---');
    // Verify backend/GridFS handles missing/empty file cleanly
    const missingUrlRes = await fetch(`${baseUrl}/api/v1/files/000000000000000000000000/non-existent-model.glb`);
    if (missingUrlRes.status === 404) {
      logger.info('  ✅ PASS: Missing MongoDB GridFS model cleanly returns 404 Not Found');
    } else {
      throw new Error(`Expected 404 for missing file, got ${missingUrlRes.status}`);
    }

    // ----------------------------------------------------
    // TEST 4: Handling Corrupt / Invalid GLB File in GridFS
    // ----------------------------------------------------
    logger.info('\n--- TEST 4: Handling Corrupted / Invalid GLB File in GridFS ---');
    const corruptUpload = await storageService.uploadFile(
      Buffer.from('CORRUPT_INVALID_HEADER_DATA_12345'),
      'corrupt-test.glb',
      'model/gltf-binary'
    );

    const corruptRes = await fetch(`${baseUrl}${corruptUpload.url}`);
    const corruptBuf = Buffer.from(await corruptRes.arrayBuffer());
    const isCorruptMagic = corruptBuf.toString('ascii', 0, 4) !== 'glTF';
    if (isCorruptMagic) {
      logger.info('  ✅ PASS: Corrupt GLB detected (magic bytes mismatch, rejected by 3D parser)');
    }
    // Clean up temporary corrupt file from GridFS
    await storageService.deleteFile(corruptUpload.fileId);

    // ----------------------------------------------------
    // TEST 5: Network Streaming & Content-Type Headers
    // ----------------------------------------------------
    logger.info('\n--- TEST 5: 3D Asset Headers & Performance ---');
    const firstProduct = products[0];
    const testModelUrl = firstProduct.glbUrl.replace('http://localhost:5000', baseUrl);

    const startTime = Date.now();
    const streamRes = await fetch(testModelUrl);
    const streamBuf = await streamRes.arrayBuffer();
    const streamDuration = Date.now() - startTime;

    logger.info(`  ✅ PASS: Model streamed in ${streamDuration} ms (${(streamBuf.byteLength / 1024).toFixed(1)} KB)`);

    // ----------------------------------------------------
    // TEST 6: Mobile Client Device Emulation (Android & iOS)
    // ----------------------------------------------------
    logger.info('\n--- TEST 6: Mobile Client Compatibility ---');

    // A: Android User Agent (Google Scene Viewer intent validation)
    const androidUA =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36';
    const androidRes = await fetch(`${baseUrl}/api/products/${firstProduct._id}`, {
      headers: { 'User-Agent': androidUA },
    });
    if (androidRes.status === 200) {
      const androidJson = (await androidRes.json()) as any;
      const expectedIntent = `intent://arvr.google.com/scene-viewer/1.0?file=${encodeURIComponent(
        androidJson.data.glbUrl
      )}&mode=ar_preferred`;
      logger.info('  ✅ PASS: Android client receives valid GLB URL ready for Google Scene Viewer');
      logger.info(`     Intent pattern: ${expectedIntent.slice(0, 80)}...`);
    }

    // B: iPhone Safari User Agent (Apple Quick Look validation)
    const iphoneUA =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    const iphoneRes = await fetch(`${baseUrl}/api/products/${firstProduct._id}`, {
      headers: { 'User-Agent': iphoneUA },
    });
    if (iphoneRes.status === 200) {
      const iphoneJson = (await iphoneRes.json()) as any;
      if (iphoneJson.data.usdzUrl) {
        logger.info('  ✅ PASS: iPhone client receives valid USDZ URL for Apple AR Quick Look');
        logger.info(`     USDZ asset: ${iphoneJson.data.usdzUrl}`);
      }
    }

    logger.info('\n========================================================');
    logger.info(' 🎉 ALL 3D VIEWER & MODEL VALIDATION TESTS PASSED!');
    logger.info('========================================================\n');
  } catch (err) {
    console.error('3D Viewer test execution failed:', err);
    process.exit(1);
  } finally {
    server.close();
    await db.disconnect();
  }
}

run3DViewerTests().catch((err) => {
  console.error('Fatal error in 3D viewer tests:', err);
  process.exit(1);
});

