const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Inventory = require('../models/Inventory');

dotenv.config();

const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB Connected\n');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
};

const fixInventoryIntegrity = async () => {
  try {
    console.log('🔧 CHECKING AND FIXING INVENTORY INTEGRITY...\n');

    const inventories = await Inventory.find().populate('productId', 'name sku');
    
    let totalChecked = 0;
    let totalFixed = 0;
    let totalErrors = 0;

    console.log(`Found ${inventories.length} inventory records to check\n`);

    for (const inv of inventories) {
      totalChecked++;
      
      const calculated = inv.availableStock + inv.reservedStock + inv.dispatchedStock;
      
      if (calculated !== inv.totalStock) {
        totalErrors++;
        const productName = inv.productId?.name || 'Unknown Product';
        const productSku = inv.productId?.sku || 'N/A';
        
        console.log(`❌ INTEGRITY ERROR:`);
        console.log(`   Product: ${productName} (${productSku})`);
        console.log(`   Current Total: ${inv.totalStock}`);
        console.log(`   Calculated: ${calculated} (Available: ${inv.availableStock} + Reserved: ${inv.reservedStock} + Dispatched: ${inv.dispatchedStock})`);
        console.log(`   Difference: ${inv.totalStock - calculated}`);
        
        // Fix by recalculating totalStock
        inv.totalStock = calculated;
        await inv.save();
        
        totalFixed++;
        console.log(`   ✅ FIXED: Updated totalStock to ${calculated}\n`);
      }
    }

    console.log('═══════════════════════════════════════');
    console.log('📊 SUMMARY:');
    console.log(`   Total Records Checked: ${totalChecked}`);
    console.log(`   Errors Found: ${totalErrors}`);
    console.log(`   Records Fixed: ${totalFixed}`);
    console.log(`   Clean Records: ${totalChecked - totalErrors}`);
    console.log('═══════════════════════════════════════\n');

    if (totalFixed > 0) {
      console.log('✅ All inventory integrity issues have been fixed!');
    } else {
      console.log('✅ No integrity issues found - all inventory records are correct!');
    }

    // Run validation on all records
    console.log('\n🔍 VALIDATING ALL RECORDS...\n');
    
    let validationErrors = 0;
    for (const inv of inventories) {
      try {
        await inv.validateStockIntegrity();
      } catch (error) {
        validationErrors++;
        console.log(`❌ Validation failed for ${inv.productId?.name}: ${error.message}`);
      }
    }

    if (validationErrors === 0) {
      console.log('✅ All records passed validation!\n');
    } else {
      console.log(`⚠️  ${validationErrors} records still have validation errors\n`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

connectDB().then(() => fixInventoryIntegrity());
