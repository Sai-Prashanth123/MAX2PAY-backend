const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');
const Client = require('../models/Client');
const Product = require('../models/Product');
const Inventory = require('../models/Inventory');
const Order = require('../models/Order');

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

const verifyAndFixData = async () => {
  try {
    console.log('🔍 VERIFYING CLIENT DATA ASSOCIATIONS...\n');

    // 1. Check Client Users
    console.log('1️⃣ Checking Client Users:');
    const clientUsers = await User.find({ role: 'client' }).populate('clientId');
    
    for (const user of clientUsers) {
      if (!user.clientId) {
        console.log(`   ❌ User ${user.email} has no clientId!`);
      } else {
        console.log(`   ✅ ${user.email} → ${user.clientId.companyName} (${user.clientId._id})`);
      }
    }

    // 2. Check Inventory Associations
    console.log('\n2️⃣ Checking Inventory Records:');
    const inventories = await Inventory.find()
      .populate('clientId', 'companyName')
      .populate('productId', 'name');
    
    let inventoryIssues = 0;
    for (const inv of inventories) {
      if (!inv.clientId) {
        console.log(`   ❌ Inventory for product ${inv.productId?.name || inv.productId} has no clientId!`);
        inventoryIssues++;
      }
    }
    
    if (inventoryIssues === 0) {
      console.log(`   ✅ All ${inventories.length} inventory records have valid clientId`);
    }

    // 3. Check Orders
    console.log('\n3️⃣ Checking Orders:');
    const orders = await Order.find().populate('clientId', 'companyName');
    
    if (orders.length === 0) {
      console.log('   ℹ️  No orders found (expected for fresh seed)');
    } else {
      let orderIssues = 0;
      for (const order of orders) {
        if (!order.clientId) {
          console.log(`   ❌ Order ${order.orderNumber} has no clientId!`);
          orderIssues++;
        }
      }
      if (orderIssues === 0) {
        console.log(`   ✅ All ${orders.length} orders have valid clientId`);
      }
    }

    // 4. Check Inventory Stock Integrity
    console.log('\n4️⃣ Checking Inventory Stock Integrity:');
    let stockIssues = 0;
    const fixes = [];

    for (const inv of inventories) {
      const calculated = inv.availableStock + inv.reservedStock + inv.dispatchedStock;
      
      if (calculated !== inv.totalStock) {
        stockIssues++;
        console.log(`   ❌ ${inv.productId?.name || 'Unknown'}: Total=${inv.totalStock}, Calculated=${calculated} (Diff: ${inv.totalStock - calculated})`);
        
        fixes.push({
          _id: inv._id,
          productName: inv.productId?.name,
          oldTotal: inv.totalStock,
          newTotal: calculated
        });
      }
    }

    if (stockIssues === 0) {
      console.log('   ✅ All inventory records have correct stock calculations');
    } else {
      console.log(`\n   Found ${stockIssues} inventory records with stock integrity issues`);
      
      // Ask to fix
      console.log('\n🔧 FIXING STOCK INTEGRITY ISSUES...');
      
      for (const fix of fixes) {
        await Inventory.findByIdAndUpdate(fix._id, {
          totalStock: fix.newTotal
        });
        console.log(`   ✅ Fixed ${fix.productName}: ${fix.oldTotal} → ${fix.newTotal}`);
      }
    }

    // 5. Summary by Client
    console.log('\n📊 SUMMARY BY CLIENT:');
    const clients = await Client.find();
    
    for (const client of clients) {
      const userCount = await User.countDocuments({ clientId: client._id, role: 'client' });
      const productCount = await Product.countDocuments({ clientId: client._id });
      const inventoryCount = await Inventory.countDocuments({ clientId: client._id });
      const orderCount = await Order.countDocuments({ clientId: client._id });
      
      console.log(`\n   ${client.companyName}:`);
      console.log(`   - Users: ${userCount}`);
      console.log(`   - Products: ${productCount}`);
      console.log(`   - Inventory Items: ${inventoryCount}`);
      console.log(`   - Orders: ${orderCount}`);
      
      if (userCount === 0) {
        console.log('   ⚠️  WARNING: No users for this client!');
      }
      if (inventoryCount === 0) {
        console.log('   ⚠️  WARNING: No inventory for this client!');
      }
    }

    console.log('\n✅ VERIFICATION COMPLETE!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
};

connectDB().then(() => verifyAndFixData());
