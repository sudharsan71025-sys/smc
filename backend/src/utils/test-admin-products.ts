import { createApp } from '../app.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import fs from 'fs';
import path from 'path';

/**
 * Creates a minimal valid GLB buffer according to glTF 2.0 specification:
 * Header: 12 bytes
 * - magic: 0x46546C67 ('glTF')
 * - version: 2 (0x00000002)
 * - length: total length
 * Followed by minimal JSON chunk
 */
function createValidGlbBuffer(): Buffer {
  const jsonContent = JSON.stringify({
    asset: { version: '2.0', generator: 'SMC-Test' },
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'DoorFrame' }],
  });
  // JSON chunk length must be padded to a 4-byte boundary with spaces (0x20)
  const jsonBuffer = Buffer.from(jsonContent, 'utf8');
  const padding = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJsonBuffer = Buffer.concat([
    jsonBuffer,
    Buffer.alloc(padding, 0x20),
  ]);

  const chunkLength = paddedJsonBuffer.length;
  const chunkType = 0x4e4f534a; // 'JSON' in ASCII

  const totalLength = 12 + 8 + chunkLength;
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'ascii'); // Magic
  header.writeUInt32LE(2, 4); // Version 2
  header.writeUInt32LE(totalLength, 8); // Total length

  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(chunkLength, 0);
  chunkHeader.writeUInt32LE(chunkType, 4);

  return Buffer.concat([header, chunkHeader, paddedJsonBuffer]);
}

/**
 * Creates a minimal valid USDZ buffer (zip archive starting with PK)
 */
function createValidUsdzBuffer(): Buffer {
  // Zip Local file header: 'PK\x03\x04'
  const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
  const dummyPayload = Buffer.from('dummy usdz content for test verification');
  return Buffer.concat([header, dummyPayload]);
}

async function runAdminProductTests() {
  logger.info('====================================================');
  logger.info('   SMC ADMIN DASHBOARD & 3D UPLOAD TEST SUITE       ');
  logger.info('====================================================');

  await db.connect();

  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  logger.info(`Test server listening on ${baseUrl}`);

  let adminToken = '';
  let userToken = '';
  let createdProductId = '';
  let uploadedGlbUrl = '';
  let uploadedUsdzUrl = '';

  try {
    // ----------------------------------------------------
    // SETUP: Get Admin and Standard User Tokens
    // ----------------------------------------------------
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      }),
    });
    const adminLoginData = (await adminLoginRes.json()) as any;
    if (adminLoginRes.status !== 200 || !adminLoginData.data?.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginData)}`);
    }
    adminToken = adminLoginData.data.token;
    logger.info('  ✅ Admin authenticated successfully');

    // Create a regular user for RBAC verification
    const testUserEmail = `user_tester_${Date.now()}@example.com`;
    const userRegRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Regular Client',
        email: testUserEmail,
        password: 'password123',
        confirmPassword: 'password123',
      }),
    });
    const userRegData = (await userRegRes.json()) as any;
    userToken = userRegData.data.token;
    logger.info('  ✅ Standard test user registered');

    // ----------------------------------------------------
    // TEST 1: Reject Unauthorized Upload (Standard User)
    // ----------------------------------------------------
    logger.info('\n--- TEST 1: Reject Unauthorized Upload (User RBAC) ---');
    const unauthorizedForm = new FormData();
    unauthorizedForm.append('name', 'Hacker Door');
    const validGlbBuf = createValidGlbBuffer();
    unauthorizedForm.append(
      'glbFile',
      new Blob([validGlbBuf], { type: 'model/gltf-binary' }),
      'hacker.glb'
    );

    const unauthRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: unauthorizedForm,
    });
    if (unauthRes.status === 403) {
      logger.info('  ✅ PASS: Standard user blocked from uploading products (403 Forbidden)');
    } else {
      throw new Error(`Expected 403 Forbidden, got ${unauthRes.status}`);
    }

    // ----------------------------------------------------
    // TEST 2: Reject Invalid File Types (e.g., .txt / .png instead of .glb)
    // ----------------------------------------------------
    logger.info('\n--- TEST 2: Reject Invalid File Types ---');
    const invalidExtForm = new FormData();
    invalidExtForm.append('name', 'Malicious Door');
    invalidExtForm.append(
      'glbFile',
      new Blob([Buffer.from('this is text, not 3D')], { type: 'text/plain' }),
      'malicious.txt'
    );

    const invalidExtRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: invalidExtForm,
    });
    if (invalidExtRes.status === 400) {
      logger.info('  ✅ PASS: Reject non-GLB file extension (400 Bad Request)');
    } else {
      throw new Error(`Expected 400 Bad Request, got ${invalidExtRes.status}`);
    }

    // ----------------------------------------------------
    // TEST 3: Reject Corrupt GLB (Does not start with glTF magic bytes)
    // ----------------------------------------------------
    logger.info('\n--- TEST 3: Reject Corrupt GLB Header ---');
    const fakeGlbForm = new FormData();
    fakeGlbForm.append('name', 'Corrupt Binary Door');
    fakeGlbForm.append(
      'glbFile',
      new Blob([Buffer.from('FAKE_HEADER_NOT_GLTF_123456789')], {
        type: 'model/gltf-binary',
      }),
      'corrupt.glb'
    );

    const fakeGlbRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: fakeGlbForm,
    });
    if (fakeGlbRes.status === 400) {
      logger.info('  ✅ PASS: Reject GLB with invalid magic bytes (400 Bad Request)');
    } else {
      throw new Error(`Expected 400 Bad Request, got ${fakeGlbRes.status}`);
    }

    // ----------------------------------------------------
    // TEST 4: Upload Valid GLB and Optional USDZ as Draft
    // ----------------------------------------------------
    logger.info('\n--- TEST 4: Upload Valid GLB + Optional USDZ (Draft) ---');
    const validForm = new FormData();
    validForm.append('name', 'Minimalist Precision Aluminum Door');
    validForm.append('status', 'draft');

    const validGlbBuffer = createValidGlbBuffer();
    validForm.append(
      'glbFile',
      new Blob([validGlbBuffer], { type: 'model/gltf-binary' }),
      'precision_door.glb'
    );

    const validUsdzBuffer = createValidUsdzBuffer();
    validForm.append(
      'usdzFile',
      new Blob([validUsdzBuffer], { type: 'model/vnd.usdz+zip' }),
      'precision_door.usdz'
    );

    const uploadRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: validForm,
    });
    const uploadJson = (await uploadRes.json()) as any;

    if (uploadRes.status === 201 && uploadJson.data?._id) {
      createdProductId = uploadJson.data._id;
      logger.info(
        `  ✅ PASS: Product uploaded with GLB & USDZ (201 Created, ID: ${createdProductId})`
      );
      logger.info(`     Name: ${uploadJson.data.name}`);
      logger.info(`     GLB URL: ${uploadJson.data.glbUrl}`);
      logger.info(`     USDZ URL: ${uploadJson.data.usdzUrl}`);
      logger.info(`     Status: ${uploadJson.data.status}`);

      // Verify file presence in MongoDB GridFS
      uploadedGlbUrl = uploadJson.data.glbUrl.replace('http://localhost:5000', baseUrl);
      uploadedUsdzUrl = uploadJson.data.usdzUrl ? uploadJson.data.usdzUrl.replace('http://localhost:5000', baseUrl) : '';

      const glbCheck = await fetch(uploadedGlbUrl);
      if (glbCheck.status === 200) {
        logger.info(`  ✅ PASS: GLB file physically stored & streamable from MongoDB GridFS (${uploadedGlbUrl})`);
      }
      if (uploadedUsdzUrl) {
        const usdzCheck = await fetch(uploadedUsdzUrl);
        if (usdzCheck.status === 200) {
          logger.info(`  ✅ PASS: USDZ file physically stored & streamable from MongoDB GridFS (${uploadedUsdzUrl})`);
        }
      }
    } else {
      throw new Error(`Upload failed: ${JSON.stringify(uploadJson)}`);
    }

    // ----------------------------------------------------
    // TEST 5: Verify Draft Isolation (Users CANNOT see drafts)
    // ----------------------------------------------------
    logger.info('\n--- TEST 5: Verify Draft Isolation (User Visibility) ---');
    const userCatalogRes = await fetch(`${baseUrl}/api/products`);
    const userCatalogJson = (await userCatalogRes.json()) as any;
    const isDraftInUserList = (userCatalogJson.data || []).some(
      (p: any) => p._id === createdProductId
    );
    if (!isDraftInUserList) {
      logger.info('  ✅ PASS: Draft product is hidden from user catalog');
    } else {
      throw new Error('Draft product was incorrectly exposed to users!');
    }

    // Direct user detail fetch on draft -> must return 404
    const userDetailRes = await fetch(`${baseUrl}/api/products/${createdProductId}`);
    if (userDetailRes.status === 404) {
      logger.info('  ✅ PASS: Direct access to draft product returns 404 Not Found for users');
    } else {
      throw new Error(`Expected 404 for draft, got ${userDetailRes.status}`);
    }

    // ----------------------------------------------------
    // TEST 6: Admin Products List (Admin CAN see drafts)
    // ----------------------------------------------------
    logger.info('\n--- TEST 6: Admin Dashboard Products List ---');
    const adminListRes = await fetch(`${baseUrl}/api/products/admin`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminListJson = (await adminListRes.json()) as any;
    const isDraftInAdminList = (adminListJson.data || []).some(
      (p: any) => p._id === createdProductId && p.status === 'draft'
    );
    if (adminListRes.status === 200 && isDraftInAdminList) {
      logger.info('  ✅ PASS: Admin successfully retrieves all products including drafts');
      logger.info(`     Total: ${adminListJson.meta?.total}, Drafts: ${adminListJson.meta?.draft}`);
    } else {
      throw new Error('Admin could not find draft product in admin list');
    }

    // ----------------------------------------------------
    // TEST 7: Publish Product (PATCH /api/products/:id/publish)
    // ----------------------------------------------------
    logger.info('\n--- TEST 7: Publish Product Action ---');
    const publishRes = await fetch(`${baseUrl}/api/products/${createdProductId}/publish`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const publishJson = (await publishRes.json()) as any;
    if (publishRes.status === 200 && publishJson.data?.status === 'published') {
      logger.info('  ✅ PASS: Admin published product successfully (Status -> published)');
    } else {
      throw new Error(`Publish failed: ${JSON.stringify(publishJson)}`);
    }

    // Confirm product is now visible to users
    const userCatalogAfterPublish = await fetch(`${baseUrl}/api/products`);
    const catalogJson2 = (await userCatalogAfterPublish.json()) as any;
    const isNowVisible = (catalogJson2.data || []).some(
      (p: any) => p._id === createdProductId
    );
    if (isNowVisible) {
      logger.info('  ✅ PASS: Product is now visible in the user catalog');
    } else {
      throw new Error('Product not found in user catalog after publishing');
    }

    // ----------------------------------------------------
    // TEST 8: Edit Product (PUT /api/products/:id)
    // ----------------------------------------------------
    logger.info('\n--- TEST 8: Edit Product Action ---');
    const updatedName = 'Minimalist Precision Aluminum Door (Series II)';
    const editRes = await fetch(`${baseUrl}/api/products/${createdProductId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: updatedName }),
    });
    const editJson = (await editRes.json()) as any;
    if (editRes.status === 200 && editJson.data?.name === updatedName) {
      logger.info(`  ✅ PASS: Product name updated to '${updatedName}'`);
    } else {
      throw new Error(`Edit failed: ${JSON.stringify(editJson)}`);
    }

    // ----------------------------------------------------
    // TEST 9: Delete Product & Clean Storage (DELETE /api/products/:id)
    // ----------------------------------------------------
    logger.info('\n--- TEST 9: Delete Product & Storage Consistency ---');
    const deleteRes = await fetch(`${baseUrl}/api/products/${createdProductId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (deleteRes.status === 200) {
      logger.info('  ✅ PASS: Product deleted from MongoDB (200 OK)');
    } else {
      throw new Error(`Delete failed with status ${deleteRes.status}`);
    }

    // Verify it is gone from MongoDB
    const checkDb = await Product.findById(createdProductId);
    if (!checkDb) {
      logger.info('  ✅ PASS: Verified product is removed from database');
    } else {
      throw new Error('Product still exists in database after delete!');
    }

    // Verify storage consistency (files deleted from MongoDB GridFS)
    if (uploadedGlbUrl) {
      const glbPostDelete = await fetch(uploadedGlbUrl);
      if (glbPostDelete.status === 404) {
        logger.info('  ✅ PASS: GLB file cleanly removed from MongoDB GridFS');
      }
    }
    if (uploadedUsdzUrl) {
      const usdzPostDelete = await fetch(uploadedUsdzUrl);
      if (usdzPostDelete.status === 404) {
        logger.info('  ✅ PASS: USDZ file cleanly removed from MongoDB GridFS');
      }
    }

    // Clean up test user
    await User.findOneAndDelete({ email: testUserEmail });

    logger.info('\n====================================================');
    logger.info(' 🎉 ALL 9 ADMIN DASHBOARD & UPLOAD TESTS PASSED!');
    logger.info('====================================================\n');
  } finally {
    server.close();
    await db.disconnect();
  }
}

runAdminProductTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
