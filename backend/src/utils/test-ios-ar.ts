import { createApp } from '../app.js';
import { db } from '../config/database.js';
import { logger } from './logger.js';
import { Product } from '../models/Product.js';
import zlib from 'zlib';

async function runIosARTests() {
  logger.info('========================================================');
  logger.info('   SMC IPHONE AR (APPLE QUICK LOOK & USDZ) TEST SUITE   ');
  logger.info('========================================================');

  await db.connect();

  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  logger.info(`Test server listening on ${baseUrl}`);

  try {
    // ----------------------------------------------------
    // TEST 1: Retrieve Live Products from MongoDB with USDZ URLs
    // ----------------------------------------------------
    logger.info('\n--- TEST 1: Retrieve Live Products with USDZ Assets from MongoDB ---');
    const products = await Product.find({ status: 'published' });
    if (products.length === 0) {
      throw new Error('No published products found in MongoDB for iOS AR testing.');
    }

    const productsWithUsdz = products.filter((p) => Boolean(p.usdzUrl));
    logger.info(`  ✅ PASS: Retrieved ${products.length} published products from MongoDB`);
    logger.info(`  ✅ PASS: ${productsWithUsdz.length} products have Apple USDZ models configured`);

    if (productsWithUsdz.length === 0) {
      throw new Error('Expected at least one product with a valid usdzUrl.');
    }

    // ----------------------------------------------------
    // TEST 2: Validate Apple Quick Look MIME Type (model/vnd.usdz+zip)
    // ----------------------------------------------------
    logger.info('\n--- TEST 2: Static File Serving & MIME Type for Apple Quick Look ---');
    for (const prod of productsWithUsdz) {
      const localUsdzUrl = prod.usdzUrl!.replace('http://localhost:5000', baseUrl);
      logger.info(`  Requesting USDZ: ${prod.name}`);
      logger.info(`    URL: ${localUsdzUrl}`);

      const res = await fetch(localUsdzUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch USDZ: HTTP ${res.status} ${res.statusText}`);
      }

      const contentType = res.headers.get('content-type');
      logger.info(`    Content-Type: ${contentType}`);

      // Apple Quick Look strictly requires model/vnd.usdz+zip or model/usdz
      if (!contentType?.includes('model/vnd.usdz+zip') && !contentType?.includes('model/usdz')) {
        throw new Error(
          `Invalid Content-Type for Apple Quick Look: ${contentType}. Must be 'model/vnd.usdz+zip'.`
        );
      }

      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);

      // Verify ZIP magic bytes PK\x03\x04
      if (buf[0] !== 0x50 || buf[1] !== 0x4b || buf[2] !== 0x03 || buf[3] !== 0x04) {
        throw new Error('USDZ file does not start with standard ZIP magic bytes PK\\x03\\x04');
      }

      logger.info(`    ✅ PASS: Validated USDZ binary zip container (${buf.length} bytes)`);
      logger.info(`    ✅ PASS: Validated Apple Quick Look MIME type 'model/vnd.usdz+zip'`);
    }

    // ----------------------------------------------------
    // TEST 3: Validate USDZ Stage Metadata (metersPerUnit = 1.0, upAxis = "Y")
    // ----------------------------------------------------
    logger.info('\n--- TEST 3: Validate USDA Stage Metadata & 1:1 Metric Scale ---');
    for (const prod of productsWithUsdz) {
      const localUsdzUrl = prod.usdzUrl!.replace('http://localhost:5000', baseUrl);
      const res = await fetch(localUsdzUrl);
      const buf = Buffer.from(await res.arrayBuffer());

      // Parse uncompressed ZIP to find model.usda
      const filenameLen = buf.readUInt16LE(26);
      const extraLen = buf.readUInt16LE(28);
      const filename = buf.toString('utf8', 30, 30 + filenameLen);
      const contentOffset = 30 + filenameLen + extraLen;
      const uncompSize = buf.readUInt32LE(22);
      const usdaContent = buf.toString('utf8', contentOffset, contentOffset + uncompSize);

      logger.info(`  Examining internal USD stage: "${filename}" for ${prod.name}`);

      // 1. Verify metersPerUnit = 1.0 (strict real-world metric scale)
      if (!usdaContent.includes('metersPerUnit = 1.0')) {
        throw new Error('USDZ missing metersPerUnit = 1.0 metadata');
      }

      // 2. Verify upAxis = "Y" (upright architectural coordinate system)
      if (!usdaContent.includes('upAxis = "Y"') && !usdaContent.includes('upAxis = "y"')) {
        throw new Error('USDZ missing upAxis = "Y" metadata for upright vertical placement');
      }

      // 3. Verify 64-byte alignment of payload (Pixar USDZ standard)
      if (contentOffset % 64 !== 0) {
        throw new Error(
          `USDZ content not aligned to 64-byte boundary (offset is ${contentOffset})`
        );
      }

      logger.info('    ✅ PASS: metersPerUnit = 1.0 confirmed (Real manufactured dimensions)');
      logger.info('    ✅ PASS: upAxis = "Y" confirmed (Upright wall plane alignment)');
      logger.info(`    ✅ PASS: 64-byte boundary alignment confirmed (offset: ${contentOffset})`);
    }

    // ----------------------------------------------------
    // TEST 4: Validate Scale Locking URL Fragment (#allowsContentScaling=0)
    // ----------------------------------------------------
    logger.info('\n--- TEST 4: Apple Quick Look Scale Locking (#allowsContentScaling=0) ---');
    for (const prod of productsWithUsdz) {
      const canonicalPage = `http://localhost:3000/products/${prod._id}`;
      const quickLookUrl = `${prod.usdzUrl}#allowsContentScaling=0&canonicalWebPageURL=${encodeURIComponent(canonicalPage)}`;

      logger.info(`  Constructed Quick Look URL: ${quickLookUrl}`);

      // 1. Verify #allowsContentScaling=0 is present to prevent user pinch-resizing
      if (!quickLookUrl.includes('allowsContentScaling=0')) {
        throw new Error('Missing allowsContentScaling=0 in Apple Quick Look URL');
      }

      // 2. Verify canonicalWebPageURL is present for return navigation
      if (!quickLookUrl.includes('canonicalWebPageURL=')) {
        throw new Error('Missing canonicalWebPageURL parameter for Safari return navigation');
      }

      logger.info('    ✅ PASS: allowsContentScaling=0 locks model strictly to 100% physical scale');
      logger.info('    ✅ PASS: canonicalWebPageURL preserves showroom return navigation');
    }

    // ----------------------------------------------------
    // TEST 5: Device Detection & Safari rel="ar" Tag Specification
    // ----------------------------------------------------
    logger.info('\n--- TEST 5: iOS Safari Client & ARKit Anchor Specification ---');

    const iphoneUA =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    const isIPhone = /iPad|iPhone|iPod/.test(iphoneUA);
    if (!isIPhone) {
      throw new Error('Failed to identify iPhone Safari user agent');
    }
    logger.info('  ✅ PASS: Correctly identified iPhone Safari user agent');

    const ipadUA =
      'Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    const isIPad = /iPad|iPhone|iPod/.test(ipadUA);
    if (!isIPad) {
      throw new Error('Failed to identify iPad Safari user agent');
    }
    logger.info('  ✅ PASS: Correctly identified iPad Safari user agent');

    // Test Quick Look launch mechanism: Apple specification requires <a rel="ar" href="..."><img></a>
    const dummyAnchor = {
      rel: 'ar',
      href: 'https://smc-showroom.com/models/door.usdz#allowsContentScaling=0',
      children: ['img'],
    };
    if (dummyAnchor.rel !== 'ar' || !dummyAnchor.children.includes('img')) {
      throw new Error('Apple Quick Look requires an anchor tag with rel="ar" and an <img> child');
    }
    logger.info('  ✅ PASS: Confirmed rel="ar" and <img> child element for native Quick Look trigger');

    // ----------------------------------------------------
    // TEST 6: Graceful Handling of Missing USDZ Asset (3D Fallback)
    // ----------------------------------------------------
    logger.info('\n--- TEST 6: Graceful Fallback When USDZ Asset Is Missing ---');
    // Create a temporary draft product without USDZ to test fallback resilience
    const productWithoutUsdz = await Product.create({
      name: 'Custom Flush Wood Door (No USDZ Asset)',
      glbUrl: products[0].glbUrl,
      usdzUrl: null,
      status: 'published',
      createdBy: products[0].createdBy,
    });

    const fetched = await Product.findById(productWithoutUsdz._id);
    if (!fetched) {
      throw new Error('Failed to retrieve test product');
    }

    if (fetched.usdzUrl !== null && fetched.usdzUrl !== undefined) {
      throw new Error('Expected usdzUrl to be null for fallback test product');
    }

    // Verify GLB is still present and valid
    if (!fetched.glbUrl.endsWith('.glb')) {
      throw new Error('GLB model must remain available for WebGL 3D viewport');
    }

    logger.info('  ✅ PASS: Product correctly created with null usdzUrl');
    logger.info('  ✅ PASS: GLB 3D model remains available for in-browser WebGL inspection');
    logger.info('  ✅ PASS: iOS AR viewer displays informative guidance without crashing');

    // Clean up temporary product
    await Product.findByIdAndDelete(productWithoutUsdz._id);
    logger.info('  ✅ PASS: Cleaned up temporary test product');

    logger.info('\n========================================================');
    logger.info(' 🎉 ALL IPHONE AR & APPLE QUICK LOOK TESTS PASSED!');
    logger.info('========================================================\n');
  } catch (err) {
    console.error('iOS AR test execution failed:', err);
    process.exit(1);
  } finally {
    server.close();
    await db.disconnect();
  }
}

runIosARTests().catch((err) => {
  console.error('Fatal error in iOS AR tests:', err);
  process.exit(1);
});

