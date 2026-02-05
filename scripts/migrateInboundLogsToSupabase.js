const mongoose = require('mongoose');
const supabase = require('../config/supabase');
require('dotenv').config();

const InboundLog = require('../models/InboundLog');
const Client = require('../models/Client');
const Product = require('../models/Product');

async function migrateInboundLogs() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/3pl-wms');
    console.log('✅ Connected to MongoDB');

    // Fetch all inbound logs from MongoDB
    const mongoLogs = await InboundLog.find({}).populate('clientId productId');
    console.log(`📦 Found ${mongoLogs.length} inbound logs in MongoDB`);

    if (mongoLogs.length === 0) {
      console.log('⚠️  No inbound logs to migrate');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create maps of Mongo IDs to Supabase IDs
    const clientMap = new Map();
    const productMap = new Map();
    
    const mongoClients = await Client.find({});
    const mongoProducts = await Product.find({});
    
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

    for (const log of mongoLogs) {
      try {
        const mongoClientId = log.clientId?._id?.toString() || log.clientId?.toString();
        const mongoProductId = log.productId?._id?.toString() || log.productId?.toString();
        
        const supabaseClientId = clientMap.get(mongoClientId);
        const supabaseProductId = productMap.get(mongoProductId);

        if (!supabaseClientId || !supabaseProductId) {
          console.log(`⚠️  Skipping log ${log.referenceNumber} (client or product not found)`);
          skipped++;
          continue;
        }

        // Check if log already exists (by reference number)
        const { data: existing } = await supabase
          .from('inbound_logs')
          .select('id')
          .eq('reference_number', log.referenceNumber)
          .single();

        if (existing) {
          console.log(`⏭️  Skipping ${log.referenceNumber} (already exists)`);
          skipped++;
          continue;
        }

        // Prepare data for Supabase
        const logData = {
          client_id: supabaseClientId,
          product_id: supabaseProductId,
          quantity: log.quantity,
          reference_number: log.referenceNumber,
          storage_location: log.storageLocation,
          received_date: log.receivedDate?.toISOString() || new Date().toISOString(),
          received_by: log.receivedBy || null, // Already UUID string from earlier fix
          status: log.status || 'received',
          notes: log.notes || null,
          created_at: log.createdAt?.toISOString() || new Date().toISOString(),
          updated_at: log.updatedAt?.toISOString() || new Date().toISOString()
        };

        // Insert into Supabase
        const { data: newLog, error } = await supabase
          .from('inbound_logs')
          .insert(logData)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error migrating ${log.referenceNumber}:`, error.message);
          errors++;
        } else {
          console.log(`✅ Migrated: ${log.referenceNumber} → ${newLog.id}`);
          migrated++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${log.referenceNumber}:`, error.message);
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

migrateInboundLogs();
