import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { storageService } from '../services/storageService.js';
import { db } from '../config/database.js';
import { Product } from '../models/Product.js';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/**
 * Builds a standard glTF 2.0 binary (GLB) containing a 3D box mesh (vertices, normals, indices, PBR material)
 */
export function buildGlbBox(options: {
  width: number;
  height: number;
  depth: number;
  r: number;
  g: number;
  b: number;
  roughness: number;
  metalness: number;
  modelName: string;
}): Buffer {
  const { width, height, depth, r, g, b, roughness, metalness, modelName } = options;
  const hx = width / 2;
  const hy = height / 2;
  const hz = depth / 2;

  // 24 vertices for 6 faces (each face has 4 distinct vertices with distinct normals)
  // prettier-ignore
  const positions: number[] = [
    // Front (+Z)
    -hx, -hy,  hz,   hx, -hy,  hz,   hx,  hy,  hz,  -hx,  hy,  hz,
    // Back (-Z)
    -hx, -hy, -hz,  -hx,  hy, -hz,   hx,  hy, -hz,   hx, -hy, -hz,
    // Top (+Y)
    -hx,  hy, -hz,  -hx,  hy,  hz,   hx,  hy,  hz,   hx,  hy, -hz,
    // Bottom (-Y)
    -hx, -hy, -hz,   hx, -hy, -hz,   hx, -hy,  hz,  -hx, -hy,  hz,
    // Right (+X)
     hx, -hy, -hz,   hx,  hy, -hz,   hx,  hy,  hz,   hx, -hy,  hz,
    // Left (-X)
    -hx, -hy, -hz,  -hx, -hy,  hz,  -hx,  hy,  hz,  -hx,  hy, -hz,
  ];

  // prettier-ignore
  const normals: number[] = [
    // Front
    0, 0, 1,   0, 0, 1,   0, 0, 1,   0, 0, 1,
    // Back
    0, 0, -1,  0, 0, -1,  0, 0, -1,  0, 0, -1,
    // Top
    0, 1, 0,   0, 1, 0,   0, 1, 0,   0, 1, 0,
    // Bottom
    0, -1, 0,  0, -1, 0,  0, -1, 0,  0, -1, 0,
    // Right
    1, 0, 0,   1, 0, 0,   1, 0, 0,   1, 0, 0,
    // Left
    -1, 0, 0,  -1, 0, 0,  -1, 0, 0,  -1, 0, 0,
  ];

  // prettier-ignore
  const indices: number[] = [
    0, 1, 2,  0, 2, 3,       // Front
    4, 5, 6,  4, 6, 7,       // Back
    8, 9, 10, 8, 10, 11,     // Top
    12, 13, 14, 12, 14, 15,  // Bottom
    16, 17, 18, 16, 18, 19,  // Right
    20, 21, 22, 20, 22, 23   // Left
  ];

  // Pack binary buffers
  const posBuffer = Buffer.alloc(positions.length * 4);
  positions.forEach((val, i) => posBuffer.writeFloatLE(val, i * 4));

  const normBuffer = Buffer.alloc(normals.length * 4);
  normals.forEach((val, i) => normBuffer.writeFloatLE(val, i * 4));

  const idxBuffer = Buffer.alloc(indices.length * 2);
  indices.forEach((val, i) => idxBuffer.writeUInt16LE(val, i * 2));

  // Combine into single binary chunk (padded to 4-byte boundaries)
  const pad4 = (buf: Buffer) => {
    const pad = (4 - (buf.length % 4)) % 4;
    return pad === 0 ? buf : Buffer.concat([buf, Buffer.alloc(pad, 0)]);
  };

  const posPadded = pad4(posBuffer);
  const normPadded = pad4(normBuffer);
  const idxPadded = pad4(idxBuffer);

  const binChunk = Buffer.concat([posPadded, normPadded, idxPadded]);

  const posOffset = 0;
  const normOffset = posPadded.length;
  const idxOffset = posPadded.length + normPadded.length;

  const gltfJson = {
    asset: { version: '2.0', generator: 'SMC-Architectural-Engine' },
    scene: 0,
    scenes: [{ name: 'DefaultScene', nodes: [0] }],
    nodes: [{ name: modelName, mesh: 0 }],
    materials: [
      {
        name: 'ArchitecturalPBR',
        pbrMetallicRoughness: {
          baseColorFactor: [r, g, b, 1.0],
          metallicFactor: metalness,
          roughnessFactor: roughness,
        },
        doubleSided: true,
      },
    ],
    meshes: [
      {
        name: modelName,
        primitives: [
          {
            attributes: { POSITION: 0, NORMAL: 1 },
            indices: 2,
            material: 0,
          },
        ],
      },
    ],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
        max: [hx, hy, hz],
        min: [-hx, -hy, -hz],
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126, // FLOAT
        count: 24,
        type: 'VEC3',
        max: [1, 1, 1],
        min: [-1, -1, -1],
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123, // UNSIGNED_SHORT
        count: 36,
        type: 'SCALAR',
        max: [23],
        min: [0],
      },
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: posOffset,
        byteLength: posBuffer.length,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: normOffset,
        byteLength: normBuffer.length,
        target: 34962, // ARRAY_BUFFER
      },
      {
        buffer: 0,
        byteOffset: idxOffset,
        byteLength: idxBuffer.length,
        target: 34963, // ELEMENT_ARRAY_BUFFER
      },
    ],
    buffers: [{ byteLength: binChunk.length }],
  };

  const jsonString = JSON.stringify(gltfJson);
  const jsonBuf = Buffer.from(jsonString, 'utf8');
  const jsonPadding = (4 - (jsonBuf.length % 4)) % 4;
  const paddedJson = Buffer.concat([jsonBuf, Buffer.alloc(jsonPadding, 0x20)]);

  // Total GLB = Header (12) + JSON Chunk (8 + len) + BIN Chunk (8 + len)
  const totalLength = 12 + 8 + paddedJson.length + 8 + binChunk.length;

  const header = Buffer.alloc(12);
  header.write('glTF', 0, 4, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);

  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(paddedJson.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binChunk.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4); // 'BIN\0'

  return Buffer.concat([
    header,
    jsonChunkHeader,
    paddedJson,
    binChunkHeader,
    binChunk,
  ]);
}

/**
 * Builds a valid USDZ package (uncompressed ZIP with 64-byte alignment containing model.usda)
 * declaring standard Apple AR Quick Look metadata: metersPerUnit = 1.0, upAxis = "Y".
 */
export function buildUsdzPackage(options: {
  width: number;
  height: number;
  depth: number;
  r: number;
  g: number;
  b: number;
  modelName: string;
}): Buffer {
  const { width, height, depth, r, g, b, modelName } = options;
  const hx = (width / 2).toFixed(4);
  const hy = (height / 2).toFixed(4);
  const hz = (depth / 2).toFixed(4);

  const usdaContent = `#usda 1.0
(
    defaultPrim = "Root"
    metersPerUnit = 1.0
    upAxis = "Y"
)

def Xform "Root" (
    assetInfo = {
        name = "${modelName}"
    }
    kind = "component"
)
{
    def Mesh "Geometry"
    {
        float3[] extent = [(-${hx}, -${hy}, -${hz}), (${hx}, ${hy}, ${hz})]
        int[] faceVertexCounts = [4, 4, 4, 4, 4, 4]
        int[] faceVertexIndices = [
            0, 1, 2, 3,
            4, 5, 6, 7,
            8, 9, 10, 11,
            12, 13, 14, 15,
            16, 17, 18, 19,
            20, 21, 22, 23
        ]
        point3f[] points = [
            (-${hx}, -${hy}, ${hz}), (${hx}, -${hy}, ${hz}), (${hx}, ${hy}, ${hz}), (-${hx}, ${hy}, ${hz}),
            (-${hx}, -${hy}, -${hz}), (-${hx}, ${hy}, -${hz}), (${hx}, ${hy}, -${hz}), (${hx}, -${hy}, -${hz}),
            (-${hx}, ${hy}, -${hz}), (-${hx}, ${hy}, ${hz}), (${hx}, ${hy}, ${hz}), (${hx}, ${hy}, -${hz}),
            (-${hx}, -${hy}, -${hz}), (${hx}, -${hy}, -${hz}), (${hx}, -${hy}, ${hz}), (-${hx}, -${hy}, ${hz}),
            (${hx}, -${hy}, -${hz}), (${hx}, ${hy}, -${hz}), (${hx}, ${hy}, ${hz}), (${hx}, -${hy}, ${hz}),
            (-${hx}, -${hy}, -${hz}), (-${hx}, -${hy}, ${hz}), (-${hx}, ${hy}, ${hz}), (-${hx}, ${hy}, -${hz})
        ]
        color3f[] primvars:displayColor = [(${r.toFixed(2)}, ${g.toFixed(2)}, ${b.toFixed(2)})]
    }
}
`;

  const filename = 'model.usda';
  const filenameBuf = Buffer.from(filename, 'utf8');
  const contentBuf = Buffer.from(usdaContent, 'utf8');
  const crc = zlib.crc32(contentBuf);

  // Calculate extra field length for 64-byte alignment (Pixar USDZ standard)
  let extraLen = 64 - (30 + filenameBuf.length);
  if (extraLen < 4) {
    extraLen += 64;
  }
  const extraBuf = Buffer.alloc(extraLen);
  extraBuf.writeUInt16LE(0x0000, 0); // Header ID
  extraBuf.writeUInt16LE(extraLen - 4, 2); // Data length

  // Local File Header (30 bytes)
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
  localHeader.writeUInt16LE(20, 4); // version needed: 2.0
  localHeader.writeUInt16LE(0, 6); // general purpose flags
  localHeader.writeUInt16LE(0, 8); // compression: 0 (store)
  localHeader.writeUInt16LE(0, 10); // mod time
  localHeader.writeUInt16LE(0, 12); // mod date
  localHeader.writeUInt32LE(crc, 14); // crc32
  localHeader.writeUInt32LE(contentBuf.length, 18); // compressed size
  localHeader.writeUInt32LE(contentBuf.length, 22); // uncompressed size
  localHeader.writeUInt16LE(filenameBuf.length, 26);
  localHeader.writeUInt16LE(extraBuf.length, 28);

  const localFile = Buffer.concat([localHeader, filenameBuf, extraBuf, contentBuf]);
  const localOffset = 0;

  // Central Directory Header (46 bytes)
  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
  cdHeader.writeUInt16LE(20, 4); // version made by
  cdHeader.writeUInt16LE(20, 6); // version needed
  cdHeader.writeUInt16LE(0, 8); // flags
  cdHeader.writeUInt16LE(0, 10); // compression: 0
  cdHeader.writeUInt16LE(0, 12); // mod time
  cdHeader.writeUInt16LE(0, 14); // mod date
  cdHeader.writeUInt32LE(crc, 16); // crc32
  cdHeader.writeUInt32LE(contentBuf.length, 20); // comp size
  cdHeader.writeUInt32LE(contentBuf.length, 24); // uncomp size
  cdHeader.writeUInt16LE(filenameBuf.length, 28);
  cdHeader.writeUInt16LE(0, 30); // extra len in CD
  cdHeader.writeUInt16LE(0, 32); // comment len
  cdHeader.writeUInt16LE(0, 34); // disk start
  cdHeader.writeUInt16LE(0, 36); // internal attr
  cdHeader.writeUInt32LE(0, 38); // external attr
  cdHeader.writeUInt32LE(localOffset, 42); // offset of local header

  const centralDir = Buffer.concat([cdHeader, filenameBuf]);

  // End of Central Directory (EOCD, 22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(1, 8); // entries on disk
  eocd.writeUInt16LE(1, 10); // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // size of CD
  eocd.writeUInt32LE(localFile.length, 16); // offset of CD
  eocd.writeUInt16LE(0, 20); // comment len

  return Buffer.concat([localFile, centralDir, eocd]);
}

export async function seedSample3DProducts() {
  await db.connect();

  // 1. Generate Door Model (Gold/Bronze Accent: 0.77, 0.65, 0.45)
  // Real door dimensions: 1.0m width, 2.2m height, 0.08m depth
  const doorGlb = buildGlbBox({
    width: 1.0,
    height: 2.2,
    depth: 0.08,
    r: 0.77,
    g: 0.65,
    b: 0.45,
    roughness: 0.3,
    metalness: 0.8,
    modelName: 'ArchitecturalPivotDoor',
  });

  const doorUsdz = buildUsdzPackage({
    width: 1.0,
    height: 2.2,
    depth: 0.08,
    r: 0.77,
    g: 0.65,
    b: 0.45,
    modelName: 'ArchitecturalPivotDoor',
  });

  // 2. Generate Window Model (Matte Architectural Charcoal: 0.15, 0.15, 0.15)
  // Real window dimensions: 1.4m width, 1.2m height, 0.08m depth
  const windowGlb = buildGlbBox({
    width: 1.4,
    height: 1.2,
    depth: 0.08,
    r: 0.15,
    g: 0.15,
    b: 0.15,
    roughness: 0.5,
    metalness: 0.2,
    modelName: 'MinimalistCasementWindow',
  });

  const windowUsdz = buildUsdzPackage({
    width: 1.4,
    height: 1.2,
    depth: 0.08,
    r: 0.15,
    g: 0.15,
    b: 0.15,
    modelName: 'MinimalistCasementWindow',
  });

  // Upload models directly into MongoDB GridFS
  logger.info('📦 Storing 3D models into MongoDB GridFS (models.files & models.chunks)...');
  const doorGlbUpload = await storageService.uploadFile(
    doorGlb,
    'architectural-pivot-door.glb',
    'model/gltf-binary',
    { product: 'Minimalist Architectural Pivot Door', modelType: 'door' }
  );

  const doorUsdzUpload = await storageService.uploadFile(
    doorUsdz,
    'architectural-pivot-door.usdz',
    'model/vnd.usdz+zip',
    { product: 'Minimalist Architectural Pivot Door', modelType: 'door' }
  );

  const windowGlbUpload = await storageService.uploadFile(
    windowGlb,
    'minimalist-casement-window.glb',
    'model/gltf-binary',
    { product: 'Contemporary Casement Glass Window', modelType: 'window' }
  );

  const windowUsdzUpload = await storageService.uploadFile(
    windowUsdz,
    'minimalist-casement-window.usdz',
    'model/vnd.usdz+zip',
    { product: 'Contemporary Casement Glass Window', modelType: 'window' }
  );

  logger.info('✅ Successfully uploaded 3D GLB & USDZ models into MongoDB GridFS');

  // Find admin user to assign createdBy
  const admin = await User.findOne({ email: env.ADMIN_EMAIL });
  if (!admin) {
    logger.warn('Admin user not found. Run seed:admin first.');
    return;
  }

  const baseOrigin = process.env.API_BASE_URL || `http://localhost:${env.PORT}`;
  const doorGlbUrl = `${baseOrigin}${doorGlbUpload.url}`;
  const doorUsdzUrl = `${baseOrigin}${doorUsdzUpload.url}`;
  const windowGlbUrl = `${baseOrigin}${windowGlbUpload.url}`;
  const windowUsdzUrl = `${baseOrigin}${windowUsdzUpload.url}`;

  // Seed sample products into MongoDB
  const existingDoor = await Product.findOne({ name: 'Minimalist Architectural Pivot Door' });
  if (existingDoor) {
    existingDoor.glbUrl = doorGlbUrl;
    existingDoor.usdzUrl = doorUsdzUrl;
    existingDoor.glbFileId = doorGlbUpload.fileId;
    existingDoor.usdzFileId = doorUsdzUpload.fileId;
    existingDoor.status = 'published';
    await existingDoor.save();
    logger.info('✅ Updated product with MongoDB GridFS URLs: Minimalist Architectural Pivot Door');
  } else {
    await Product.create({
      name: 'Minimalist Architectural Pivot Door',
      glbUrl: doorGlbUrl,
      usdzUrl: doorUsdzUrl,
      glbFileId: doorGlbUpload.fileId,
      usdzFileId: doorUsdzUpload.fileId,
      status: 'published',
      createdBy: admin._id,
    });
    logger.info('✅ Seeded published product in MongoDB: Minimalist Architectural Pivot Door');
  }

  const existingWindow = await Product.findOne({ name: 'Contemporary Casement Glass Window' });
  if (existingWindow) {
    existingWindow.glbUrl = windowGlbUrl;
    existingWindow.usdzUrl = windowUsdzUrl;
    existingWindow.glbFileId = windowGlbUpload.fileId;
    existingWindow.usdzFileId = windowUsdzUpload.fileId;
    existingWindow.status = 'published';
    await existingWindow.save();
    logger.info('✅ Updated product with MongoDB GridFS URLs: Contemporary Casement Glass Window');
  } else {
    await Product.create({
      name: 'Contemporary Casement Glass Window',
      glbUrl: windowGlbUrl,
      usdzUrl: windowUsdzUrl,
      glbFileId: windowGlbUpload.fileId,
      usdzFileId: windowUsdzUpload.fileId,
      status: 'published',
      createdBy: admin._id,
    });
    logger.info('✅ Seeded published product in MongoDB: Contemporary Casement Glass Window');
  }
}

// Execute if run directly from CLI
if (process.argv[1]?.includes('generate-sample-models')) {
  seedSample3DProducts()
    .then(async () => {
      logger.info('Sample 3D models seeding complete.');
      await db.disconnect();
      process.exit(0);
    })
    .catch(async (err) => {
      logger.error('Failed to seed sample 3D models:', err);
      await db.disconnect();
      process.exit(1);
    });
}

