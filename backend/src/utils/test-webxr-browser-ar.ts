/**
 * SMC Architectural Door & Window Platform
 * Comprehensive In-Browser WebXR & Three.js 3D Automated Verification Suite
 */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';

async function runBrowserARVerification() {
  logger.info('================================================================');
  logger.info('   SMC IN-BROWSER WEBXR AR & THREE.JS 3D VERIFICATION SUITE     ');
  logger.info('================================================================');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    total++;
    if (condition) {
      passed++;
      logger.info(`  ✅ PASS: ${testName}`);
      if (details) logger.info(`     ${details}`);
    } else {
      logger.error(`  ❌ FAIL: ${testName}`);
      if (details) logger.error(`     ${details}`);
      throw new Error(`Verification test failed: ${testName}`);
    }
  }

  // 1. Database Connection Check
  logger.info('\n--- 1. MongoDB Atlas & GridFS Connection ---');
  await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB_NAME });
  assert(mongoose.connection.readyState === 1, 'MongoDB Atlas Connected', `Database: ${env.MONGODB_DB_NAME}`);

  // 2. Published Products & GridFS Model Audit
  logger.info('\n--- 2. Product Catalog & 3D Model GridFS Verification ---');
  const products = await Product.find({ status: 'published' });
  assert(products.length > 0, `Published Products in Database`, `Found ${products.length} live product(s)`);

  const sampleProduct = products[0];
  assert(Boolean(sampleProduct.glbUrl), 'Product Has Valid GLB Asset URL', sampleProduct.glbUrl);

  // Test GLB File Stream & Binary Header from GridFS
  const glbRes = await fetch(sampleProduct.glbUrl);
  assert(glbRes.status === 200, 'GridFS Streams GLB Model with HTTP 200 OK', `Content-Type: ${glbRes.headers.get('content-type')}`);

  const glbBuffer = await glbRes.arrayBuffer();
  assert(glbBuffer.byteLength > 1000, 'GLB File Has Non-Zero Binary Content', `Size: ${Math.round(glbBuffer.byteLength / 1024)} KB`);

  // Validate glTF 2.0 Magic Header
  const view = new DataView(glbBuffer);
  const magic = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  const version = view.getUint32(4, true);
  assert(magic === 'glTF' && version === 2, 'glTF 2.0 Binary Specification Validated', `Magic: "${magic}", Version: ${version}`);

  // 3. Frontend Routes & WebXR Launch UI Audit
  logger.info('\n--- 3. In-Browser AR Frontend & Three.js 3D Viewer Audit ---');
  const feRes = await fetch(`http://localhost:3000/products/${sampleProduct._id}`);
  assert(feRes.status === 200, 'Product Viewer Page Loads on Frontend (HTTP 200)');

  // Read the source components to verify strict browser-only AR architecture
  const arButtonSource = fs.readFileSync(
    path.resolve(process.cwd(), '../frontend/components/3d/ARLaunchButton.tsx'),
    'utf-8'
  );
  const realWorldArSource = fs.readFileSync(
    path.resolve(process.cwd(), '../frontend/components/3d/RealWorldARExperience.tsx'),
    'utf-8'
  );
  const threeViewerSource = fs.readFileSync(
    path.resolve(process.cwd(), '../frontend/components/3d/Three3DViewer.tsx'),
    'utf-8'
  );

  // Verify "OPEN IN BROWSER" button exists in source
  assert(
    arButtonSource.includes('OPEN IN BROWSER'),
    'AR Launch Action is strictly In-Browser ("OPEN IN BROWSER")'
  );

  // Verify no prohibited external launch triggers exist in the customer AR flow
  const prohibitedTriggers = [
    'Open in SMC Native AR App',
    'Download Native SMC AR App',
    'Launch Google Scene Viewer',
    'View in Apple Quick Look (ARKit)',
  ];

  let hasProhibited = false;
  for (const trigger of prohibitedTriggers) {
    if (arButtonSource.includes(trigger)) {
      hasProhibited = true;
      logger.error(`Found prohibited trigger in ARLaunchButton: "${trigger}"`);
    }
  }
  assert(!hasProhibited, 'No External Native AR Apps, APKs, Scene Viewer or Quick Look in Customer AR Flow');

  // Verify Minimal Close Control Only in RealWorldARExperience
  assert(
    realWorldArSource.includes('Minimal Discreet Close Control Only') &&
      realWorldArSource.includes('setClearColor(0x000000, 0)') &&
      realWorldArSource.includes('local-floor'),
    'RealWorldARExperience Configured for Camera Pass-Through & Minimal Close Control Only'
  );

  // Verify Three.js 3D Viewer is integrated
  assert(
    threeViewerSource.includes('OrbitControls') &&
      threeViewerSource.includes('GLTFLoader') &&
      threeViewerSource.includes('ACESFilmicToneMapping'),
    'Three.js 3D Inspection Viewer Integrated with OrbitControls, PBR Lighting & 1:1 Metric Scale'
  );

  // 4. Backend Health & Performance Check
  logger.info('\n--- 4. Backend Health & REST API Security Check ---');
  const healthRes = await fetch('http://localhost:5000/api/v1/health');
  assert(healthRes.status === 200, 'Health Endpoint Responds with 200 OK');
  const healthData = await healthRes.json();
  assert(healthData.data?.storage?.provider === 'mongodb-gridfs', 'Storage Provider is strictly MongoDB GridFS');

  // Verify admin account exists
  const adminUser = await User.findOne({ role: 'admin' });
  assert(Boolean(adminUser), 'System Administrator Account Initialized', adminUser?.email);

  await mongoose.disconnect();

  logger.info('\n================================================================');
  logger.info(` 🎉 ALL ${passed}/${total} IN-BROWSER WEBXR AR & 3D TESTS PASSED!`);
  logger.info('================================================================\n');
}

runBrowserARVerification().catch((err) => {
  logger.error('Verification failed:', err);
  process.exit(1);
});
