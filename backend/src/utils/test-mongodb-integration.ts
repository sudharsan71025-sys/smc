import { createApp } from '../app.js';
import { db } from '../config/database.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { User } from '../models/User.js';
import { Product } from '../models/Product.js';
import mongoose from 'mongoose';

async function runMongoIntegrationTests() {
  logger.info('========================================================');
  logger.info('   SMC MONGODB & DYNAMIC PRODUCT MANAGEMENT TEST SUITE  ');
  logger.info('========================================================');

  await db.connect();

  const app = createApp();
  const server = app.listen(0);
  const address = server.address() as any;
  const baseUrl = `http://127.0.0.1:${address.port}`;
  logger.info(`Test server running at ${baseUrl}`);

  let adminToken = '';
  let userToken = '';
  let createdProductId = '';

  try {
    // ----------------------------------------------------
    // SETUP: Admin and Regular User Tokens
    // ----------------------------------------------------
    const adminLoginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: env.ADMIN_EMAIL,
        password: env.ADMIN_PASSWORD,
      }),
    });
    const adminLoginJson = (await adminLoginRes.json()) as any;
    if (adminLoginRes.status !== 200 || !adminLoginJson.data?.token) {
      throw new Error(`Admin login failed: ${JSON.stringify(adminLoginJson)}`);
    }
    adminToken = adminLoginJson.data.token;
    logger.info('  ✅ Admin authenticated');

    const testUserEmail = `client_${Date.now()}@test.com`;
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
    const userRegJson = (await userRegRes.json()) as any;
    userToken = userRegJson.data.token;
    logger.info('  ✅ Regular client authenticated');

    // ----------------------------------------------------
    // SCENARIO 1: Creating a Product (Stored in MongoDB)
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 1: Creating a Product in MongoDB ---');
    const createRes = await fetch(`${baseUrl}/api/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: 'Dynamic Minimalist Pivot Door',
        glbUrl: 'http://localhost:5000/api/v1/files/models/pivot_door.glb',
        usdzUrl: 'http://localhost:5000/api/v1/files/models/pivot_door.usdz',
        status: 'draft',
      }),
    });
    const createJson = (await createRes.json()) as any;
    if (createRes.status === 201 && createJson.data?._id) {
      createdProductId = createJson.data._id;
      logger.info(`  ✅ PASS: Product created in MongoDB (201 Created)`);
      logger.info(`     ID: ${createdProductId}`);
      logger.info(`     Collection: 'products'`);
      logger.info(`     Status: ${createJson.data.status}`);

      // Direct MongoDB check
      const doc = await Product.findById(createdProductId);
      if (!doc || doc.name !== 'Dynamic Minimalist Pivot Door') {
        throw new Error('Product not found in MongoDB');
      }
      logger.info(`  ✅ PASS: Verified document persisted in MongoDB collection 'products'`);
    } else {
      throw new Error(`Create product failed: ${JSON.stringify(createJson)}`);
    }

    // ----------------------------------------------------
    // SCENARIO 2: Retrieving Unpublished Products (Isolation)
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 2: Retrieving Unpublished Products ---');
    // A: Regular user checks published list -> draft must be absent
    const userListRes = await fetch(`${baseUrl}/api/products`);
    const userListJson = (await userListRes.json()) as any;
    const isDraftInUserList = (userListJson.data || []).some(
      (p: any) => p._id === createdProductId
    );
    if (!isDraftInUserList) {
      logger.info('  ✅ PASS: Unpublished product is hidden from regular users');
    } else {
      throw new Error('Unpublished draft was visible to regular user!');
    }

    // B: Regular user direct query by ID -> 404 Not Found
    const userDetailRes = await fetch(`${baseUrl}/api/products/${createdProductId}`);
    if (userDetailRes.status === 404) {
      logger.info('  ✅ PASS: Regular user direct query on draft returns 404 Not Found');
    } else {
      throw new Error(`Expected 404 for draft detail, got ${userDetailRes.status}`);
    }

    // C: Admin direct query with Bearer token -> 200 OK (Admin can inspect managed products)
    const adminDetailRes = await fetch(`${baseUrl}/api/products/${createdProductId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const adminDetailJson = (await adminDetailRes.json()) as any;
    if (adminDetailRes.status === 200 && adminDetailJson.data?.status === 'draft') {
      logger.info('  ✅ PASS: Admin successfully inspects managed draft product (200 OK)');
    } else {
      throw new Error(`Admin inspection failed: ${JSON.stringify(adminDetailJson)}`);
    }

    // ----------------------------------------------------
    // SCENARIO 3: Updating Product Details
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 3: Updating Product Details ---');
    const updatedName = 'Dynamic Minimalist Pivot Door (Updated)';
    const updateRes = await fetch(`${baseUrl}/api/products/${createdProductId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ name: updatedName }),
    });
    const updateJson = (await updateRes.json()) as any;
    if (updateRes.status === 200 && updateJson.data?.name === updatedName) {
      logger.info(`  ✅ PASS: Product details updated to '${updatedName}'`);

      // Verify directly in MongoDB
      const updatedDoc = await Product.findById(createdProductId);
      if (updatedDoc?.name === updatedName) {
        logger.info('  ✅ PASS: Verified updated name persisted in MongoDB');
      }
    } else {
      throw new Error(`Update failed: ${JSON.stringify(updateJson)}`);
    }

    // ----------------------------------------------------
    // SCENARIO 4: Publishing a Product
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 4: Publishing a Product ---');
    const publishRes = await fetch(`${baseUrl}/api/products/${createdProductId}/publish`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const publishJson = (await publishRes.json()) as any;
    if (publishRes.status === 200 && publishJson.data?.status === 'published') {
      logger.info('  ✅ PASS: Product status changed to "published" in MongoDB');
    } else {
      throw new Error(`Publish failed: ${JSON.stringify(publishJson)}`);
    }

    // ----------------------------------------------------
    // SCENARIO 5: Retrieving Published Products
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 5: Retrieving Published Products ---');
    // Now regular users CAN see the published product
    const userPublishedRes = await fetch(`${baseUrl}/api/products`);
    const userPublishedJson = (await userPublishedRes.json()) as any;
    const isNowVisible = (userPublishedJson.data || []).some(
      (p: any) => p._id === createdProductId
    );
    if (isNowVisible) {
      logger.info('  ✅ PASS: Product is now retrieved in user published catalog');
    } else {
      throw new Error('Product not found in user catalog after publishing');
    }

    // Direct fetch by user returns 200 OK
    const userDetailPublished = await fetch(`${baseUrl}/api/products/${createdProductId}`);
    if (userDetailPublished.status === 200) {
      logger.info('  ✅ PASS: Regular user successfully accesses published product by ID');
    } else {
      throw new Error(`Expected 200 for published detail, got ${userDetailPublished.status}`);
    }

    // ----------------------------------------------------
    // SCENARIO 6: Handling Invalid Product ID
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 6: Handling Invalid Product ID ---');
    // A: Malformed ID string (e.g., 'not-a-valid-id-123') -> 400 Bad Request
    const invalidIdRes = await fetch(`${baseUrl}/api/products/not-a-valid-id-123`);
    const invalidIdJson = (await invalidIdRes.json()) as any;
    if (invalidIdRes.status === 400) {
      logger.info(`  ✅ PASS: Malformed ID rejected with 400 Bad Request (${invalidIdJson.message})`);
    } else {
      throw new Error(`Expected 400 for malformed ID, got ${invalidIdRes.status}`);
    }

    // B: Valid-format ObjectId that does not exist -> 404 Not Found
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const notFoundRes = await fetch(`${baseUrl}/api/products/${nonExistentId}`);
    if (notFoundRes.status === 404) {
      logger.info('  ✅ PASS: Non-existent ObjectId returns 404 Not Found');
    } else {
      throw new Error(`Expected 404 for non-existent ID, got ${notFoundRes.status}`);
    }

    // ----------------------------------------------------
    // SCENARIO 7: Deleting a Product
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 7: Deleting a Product ---');
    const deleteRes = await fetch(`${baseUrl}/api/products/${createdProductId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (deleteRes.status === 200) {
      logger.info('  ✅ PASS: Product deleted via API (200 OK)');

      // Verify it is completely removed from MongoDB
      const checkDoc = await Product.findById(createdProductId);
      if (!checkDoc) {
        logger.info('  ✅ PASS: Confirmed document removed from MongoDB collection');
      } else {
        throw new Error('Document still exists in MongoDB after delete');
      }
    } else {
      throw new Error(`Delete failed with status ${deleteRes.status}`);
    }

    // ----------------------------------------------------
    // SCENARIO 8: MongoDB Connection Failure & Recovery
    // ----------------------------------------------------
    logger.info('\n--- SCENARIO 8: MongoDB Connection Failure & Recovery ---');
    // Disconnect MongoDB temporarily to simulate database outage
    await db.disconnect();
    logger.info('  ⚠️ Simulated MongoDB database outage (disconnected)');

    const offlineRes = await fetch(`${baseUrl}/api/products`);
    const offlineJson = (await offlineRes.json()) as any;
    if (offlineRes.status === 503) {
      logger.info(`  ✅ PASS: Database outage handled gracefully with 503 Service Unavailable`);
      logger.info(`     Error Message: "${offlineJson.message}"`);
    } else {
      throw new Error(`Expected 503 for DB outage, got ${offlineRes.status}`);
    }

    // Reconnect MongoDB and verify service recovery
    logger.info('  🔄 Reconnecting to MongoDB Atlas cluster...');
    await db.connect();
    logger.info('  ✅ MongoDB reconnected');

    const recoveredRes = await fetch(`${baseUrl}/api/products`);
    if (recoveredRes.status === 200) {
      logger.info('  ✅ PASS: API service immediately recovered and returned 200 OK');
    } else {
      throw new Error(`Expected 200 upon recovery, got ${recoveredRes.status}`);
    }

    // Clean up test user
    await User.findOneAndDelete({ email: testUserEmail });

    logger.info('\n========================================================');
    logger.info(' 🎉 ALL 8 MONGODB & DYNAMIC PRODUCT TEST SCENARIOS PASSED!');
    logger.info('========================================================\n');
  } catch (err) {
    console.error('Test execution error:', err);
    process.exit(1);
  } finally {
    server.close();
    await db.disconnect();
  }
}

runMongoIntegrationTests().catch((err) => {
  console.error('Fatal error in integration tests:', err);
  process.exit(1);
});

