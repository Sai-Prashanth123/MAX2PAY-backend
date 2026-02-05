const mongoose = require('mongoose');
const supabase = require('../config/supabase');
require('dotenv').config();

const Client = require('../models/Client');

async function migrateClients() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/3pl-wms');
    console.log('✅ Connected to MongoDB');

    // Fetch all clients from MongoDB
    const mongoClients = await Client.find({});
    console.log(`📦 Found ${mongoClients.length} clients in MongoDB`);

    if (mongoClients.length === 0) {
      console.log('⚠️  No clients to migrate');
      await mongoose.disconnect();
      process.exit(0);
    }

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const client of mongoClients) {
      try {
        // Check if client already exists in Supabase (by email)
        const { data: existing } = await supabase
          .from('clients')
          .select('id')
          .eq('email', client.email)
          .single();

        if (existing) {
          console.log(`⏭️  Skipping ${client.email} (already exists)`);
          skipped++;
          continue;
        }

        // Prepare data for Supabase
        const clientData = {
          company_name: client.companyName,
          contact_person: client.contactPerson,
          email: client.email,
          phone: client.phone,
          address_street: client.address?.street || null,
          address_city: client.address?.city || null,
          address_state: client.address?.state || null,
          address_zip_code: client.address?.zipCode || null,
          address_country: client.address?.country || 'United States',
          tax_id: client.taxId || null,
          is_active: client.isActive !== false,
          notes: client.notes || null,
          created_at: client.createdAt?.toISOString() || new Date().toISOString(),
          updated_at: client.updatedAt?.toISOString() || new Date().toISOString()
        };

        // Insert into Supabase
        const { data: newClient, error } = await supabase
          .from('clients')
          .insert(clientData)
          .select()
          .single();

        if (error) {
          console.error(`❌ Error migrating ${client.email}:`, error.message);
          errors++;
        } else {
          console.log(`✅ Migrated: ${client.email} → ${newClient.id}`);
          migrated++;
        }
      } catch (error) {
        console.error(`❌ Error processing ${client.email}:`, error.message);
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

migrateClients();
