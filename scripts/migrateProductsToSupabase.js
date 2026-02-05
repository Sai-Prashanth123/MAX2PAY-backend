const mongoose = require('mongoose');
const supabase = require('../config/supabase');
require('dotenv').config();

const Product = require('../models/Product');
const Client = require('../models/Client');

async function migrateProducts() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/3pl-wms');
    console.log('✅ Connected to MongoDB');

    // Fetch all products from MongoDB
    const mongoProducts = await Product.find({}).populate('clientId');
    console.log(`📦 Found ${mongoProducts.length} products in MongoDB`);

    if (mongoProducts.length === 0) {
      console.log('⚠️  No products to migrate');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create a map of Mongo client IDs to Supabase client IDs (by email)
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

    console.log(`📋 Mapped ${clientMap.size} clients`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const product of mongoProducts) {
      try {
        const mongoClientId = product.clientId?._id?.toString() || product.clientId?.toString();
        const supabaseClientId = clientMap.get(mongoClientId);

        if (!supabaseClientId) {
          console.log(`⚠️  Skipping product ${product.sku} (client not found in Supabase)`);
          skipped++;
          continue;
        }

        // Check if product already exists in Supabase (by SKU)
        const { data: existing } = await supabase
          .from('products')
          .select('id')
          .eq('sku', product.sku.toUpperCase())
          .single();

        if (existing) {
          console.log(`⏭️  Skipping ${product.sku} (already exists)`);
          skipped++;
          continue;
        }

        // Prepare data for Supabase
        const productData = {
          client_id: supabaseClientId,
          name: product.name,
          sku: product.sku.toUpperCase(),
          description: product.description || null,
          category: product.category || null,
          unit: product.unit || 'pcs',
          dimensions_length: product.dimensions?.length || null,
          dimensions_width: product.dimensions?.width || null,
          dimensions_height: product.dimensions?.height || null,
          dimensions_unit: product.dimensions?.unit || 'cm',
          weight_value: product.weight?.value || null,
          weight_unit: product.weight?.unit || 'kg',
          reorder_level: product.reorderLevel || 0,
          is_active: product.isActive !== false,
          image_url: product.imageUrl || null,
          created_at: product.createdAt?.toISOString() || new Date().toISOString(),
          updated_at: product.updatedAt?.toISOString() || new Date().toISOString()
        };

        // Insert into Supabase
        const { data: newProduct, error } = await supabase
          .from('products')
          .insert(productData)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error migrating ${product.sku}:`, error.message);
          errors++;
        } else {
          console.log(`✅ Migrated: ${product.sku} → ${newProduct.id}`);
          
          // Create inventory record
          await supabase
            .from('inventory')
            .insert({
              product_id: newProduct.id,
              client_id: supabaseClientId,
              total_stock: 0,
              available_stock: 0,
              reserved_stock: 0,
              dispatched_stock: 0
            });
          
          migrated++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${product.sku}:`, error.message);
        errors++;
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped: ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);

    await mongoose.disconnect();
    console.log('\n🎉 Migration complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

migrateProducts();
