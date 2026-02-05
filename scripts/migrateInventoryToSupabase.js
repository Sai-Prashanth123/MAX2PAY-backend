const mongoose = require('mongoose');
const supabase = require('../config/supabase');
require('dotenv').config();

const Inventory = require('../models/Inventory');
const Product = require('../models/Product');
const Client = require('../models/Client');

async function migrateInventory() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/3pl-wms');
    console.log('✅ Connected to MongoDB');

    // Fetch all inventory records
    const mongoInventory = await Inventory.find({}).populate('productId').populate('clientId');
    console.log(`📦 Found ${mongoInventory.length} inventory records in MongoDB`);

    if (!mongoInventory.length) {
      console.log('⚠️  No inventory records to migrate');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Map Mongo client IDs to Supabase client IDs (by email)
    const clientMap = new Map();
    const mongoClients = await Client.find({});

    for (const mongoClient of mongoClients) {
      const { data: supabaseClient } = await supabase
        .from('clients')
        .select('id')
        .eq('email', mongoClient.email)
        .single();

      if (supabaseClient) {
        clientMap.set(mongoClient._id.toString(), supabaseClient.id);
      }
    }

    // Map Mongo product IDs to Supabase product IDs (by SKU)
    const productMap = new Map();
    const mongoProducts = await Product.find({});

    for (const mongoProduct of mongoProducts) {
      const { data: supabaseProduct } = await supabase
        .from('products')
        .select('id')
        .eq('sku', mongoProduct.sku.toUpperCase())
        .single();

      if (supabaseProduct) {
        productMap.set(mongoProduct._id.toString(), supabaseProduct.id);
      }
    }

    console.log(`📋 Mapped ${clientMap.size} clients and ${productMap.size} products`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of mongoInventory) {
      try {
        const mongoClientId = item.clientId?._id?.toString() || item.clientId?.toString();
        const mongoProductId = item.productId?._id?.toString() || item.productId?.toString();

        const supabaseClientId = clientMap.get(mongoClientId);
        const supabaseProductId = productMap.get(mongoProductId);

        if (!supabaseClientId || !supabaseProductId) {
          console.log(
            `⚠️  Skipping inventory record (product=${mongoProductId}, client=${mongoClientId}) - mapping not found`
          );
          skipped++;
          continue;
        }

        // Check if inventory already exists in Supabase
        const { data: existing } = await supabase
          .from('inventory')
          .select('id')
          .eq('product_id', supabaseProductId)
          .eq('client_id', supabaseClientId)
          .single();

        if (existing) {
          console.log(
            `⏭️  Skipping inventory for product=${mongoProductId}, client=${mongoClientId} (already exists)`
          );
          skipped++;
          continue;
        }

        const inventoryData = {
          product_id: supabaseProductId,
          client_id: supabaseClientId,
          total_stock: item.totalStock,
          available_stock: item.availableStock,
          reserved_stock: item.reservedStock,
          dispatched_stock: item.dispatchedStock,
          storage_location: item.storageLocation || null,
          last_updated: item.lastUpdated || new Date().toISOString(),
          created_at: item.createdAt?.toISOString() || new Date().toISOString(),
          updated_at: item.updatedAt?.toISOString() || new Date().toISOString(),
        };

        const { error } = await supabase.from('inventory').insert(inventoryData);

        if (error) {
          console.error('❌ Error inserting inventory:', error.message);
          errors++;
        } else {
          console.log(
            `✅ Migrated inventory for product=${mongoProductId}, client=${mongoClientId}`
          );
          migrated++;
        }
      } catch (error) {
        console.error('❌ Error processing inventory item:', error.message);
        errors++;
      }
    }

    console.log('\n📊 Inventory Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    await mongoose.disconnect();
    console.log('\n🎉 Inventory migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Inventory migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

migrateInventory();

