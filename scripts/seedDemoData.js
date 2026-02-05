const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || 'https://taboklgtcpykicqufkha.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY is not set in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Demo client ID (for client@demo3pl.com)
const DEMO_CLIENT_ID = '536125be-30e2-4fcd-9cc6-1ed2a24a7cc2';

// Sample products for demo client
const demoProducts = [
  {
    name: 'Wireless Bluetooth Headphones',
    sku: 'WBH-001',
    description: 'Premium wireless headphones with noise cancellation',
    category: 'Electronics',
    unit: 'pcs',
    dimensions: { length: 20, width: 18, height: 8, unit: 'cm' },
    weight: { value: 0.25, unit: 'kg' },
    reorderLevel: 10,
    isActive: true
  },
  {
    name: 'Smartphone Case - Clear',
    sku: 'SPC-002',
    description: 'Transparent protective case for smartphones',
    category: 'Accessories',
    unit: 'pcs',
    dimensions: { length: 15, width: 8, height: 1, unit: 'cm' },
    weight: { value: 0.05, unit: 'kg' },
    reorderLevel: 20,
    isActive: true
  },
  {
    name: 'USB-C Charging Cable',
    sku: 'UCC-003',
    description: '6ft USB-C to USB-A charging cable',
    category: 'Cables',
    unit: 'pcs',
    dimensions: { length: 183, width: 1, height: 1, unit: 'cm' },
    weight: { value: 0.03, unit: 'kg' },
    reorderLevel: 50,
    isActive: true
  },
  {
    name: 'Laptop Stand - Adjustable',
    sku: 'LS-004',
    description: 'Ergonomic aluminum laptop stand',
    category: 'Accessories',
    unit: 'pcs',
    dimensions: { length: 30, width: 25, height: 15, unit: 'cm' },
    weight: { value: 0.8, unit: 'kg' },
    reorderLevel: 15,
    isActive: true
  },
  {
    name: 'Wireless Mouse',
    sku: 'WM-005',
    description: 'Ergonomic wireless mouse with 2.4GHz receiver',
    category: 'Peripherals',
    unit: 'pcs',
    dimensions: { length: 12, width: 6, height: 4, unit: 'cm' },
    weight: { value: 0.1, unit: 'kg' },
    reorderLevel: 25,
    isActive: true
  },
  {
    name: 'Mechanical Keyboard',
    sku: 'MK-006',
    description: 'RGB backlit mechanical keyboard',
    category: 'Peripherals',
    unit: 'pcs',
    dimensions: { length: 44, width: 13, height: 3, unit: 'cm' },
    weight: { value: 1.2, unit: 'kg' },
    reorderLevel: 12,
    isActive: true
  },
  {
    name: 'Monitor Stand - Dual',
    sku: 'MS-007',
    description: 'Dual monitor stand with gas spring arms',
    category: 'Furniture',
    unit: 'pcs',
    dimensions: { length: 60, width: 25, height: 5, unit: 'cm' },
    weight: { value: 5.5, unit: 'kg' },
    reorderLevel: 8,
    isActive: true
  },
  {
    name: 'Webcam HD 1080p',
    sku: 'WC-008',
    description: 'Full HD webcam with built-in microphone',
    category: 'Electronics',
    unit: 'pcs',
    dimensions: { length: 10, width: 3, height: 3, unit: 'cm' },
    weight: { value: 0.15, unit: 'kg' },
    reorderLevel: 18,
    isActive: true
  }
];

// Sample orders (status must be: pending, approved, packed, dispatched, delivered, cancelled)
const sampleOrders = [
  {
    status: 'pending',
    priority: 'high',
    notes: 'Rush order - need by end of week',
    items: [
      { productIndex: 0, quantity: 5, unitPrice: 79.99 },
      { productIndex: 1, quantity: 10, unitPrice: 12.99 }
    ]
  },
  {
    status: 'approved',
    priority: 'medium',
    notes: 'Standard shipping requested',
    items: [
      { productIndex: 2, quantity: 20, unitPrice: 9.99 },
      { productIndex: 3, quantity: 3, unitPrice: 45.00 }
    ]
  },
  {
    status: 'dispatched',
    priority: 'low',
    notes: 'In transit',
    items: [
      { productIndex: 4, quantity: 8, unitPrice: 24.99 }
    ]
  },
  {
    status: 'delivered',
    priority: 'medium',
    notes: 'Customer confirmed receipt',
    items: [
      { productIndex: 5, quantity: 2, unitPrice: 89.99 },
      { productIndex: 6, quantity: 1, unitPrice: 149.99 }
    ]
  },
  {
    status: 'pending',
    priority: 'high',
    notes: 'Bulk order for corporate client',
    items: [
      { productIndex: 7, quantity: 15, unitPrice: 59.99 },
      { productIndex: 0, quantity: 10, unitPrice: 79.99 }
    ]
  }
];

async function seedProducts() {
  console.log('\n📦 Seeding products...');
  const createdProducts = [];

  for (const product of demoProducts) {
    // Check if product already exists
    const { data: existing } = await supabase
      .from('products')
      .select('id')
      .eq('sku', product.sku)
      .single();

    if (existing) {
      console.log(`  ⏭️  Product ${product.sku} already exists, skipping...`);
      createdProducts.push(existing);
      continue;
    }

    const productData = {
      client_id: DEMO_CLIENT_ID,
      name: product.name,
      sku: product.sku.toUpperCase(),
      description: product.description,
      category: product.category,
      unit: product.unit,
      dimensions_length: product.dimensions.length,
      dimensions_width: product.dimensions.width,
      dimensions_height: product.dimensions.height,
      dimensions_unit: product.dimensions.unit,
      weight_value: product.weight.value,
      weight_unit: product.weight.unit,
      reorder_level: product.reorderLevel,
      is_active: product.isActive
    };

    const { data: created, error } = await supabase
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) {
      console.error(`  ❌ Error creating product ${product.sku}:`, error.message);
      continue;
    }

    console.log(`  ✅ Created product: ${product.name} (${product.sku})`);
    createdProducts.push(created);

    // Create inventory entry (use upsert with unique constraint on product_id, client_id)
    const { error: invError } = await supabase
      .from('inventory')
      .upsert({
        product_id: created.id,
        client_id: DEMO_CLIENT_ID,
        total_stock: Math.floor(Math.random() * 100) + 20, // Random stock 20-120
        available_stock: Math.floor(Math.random() * 80) + 10,
        reserved_stock: Math.floor(Math.random() * 10),
        dispatched_stock: Math.floor(Math.random() * 20)
      }, { onConflict: 'product_id,client_id' });

    if (invError) {
      console.error(`  ⚠️  Error creating inventory for ${product.sku}:`, invError.message);
    } else {
      console.log(`  ✅ Created/updated inventory entry for ${product.sku}`);
    }

    if (invError) {
      console.error(`  ⚠️  Error creating inventory for ${product.sku}:`, invError.message);
    } else {
      console.log(`  ✅ Created inventory entry for ${product.sku}`);
    }
  }

  return createdProducts;
}

async function seedOrders(products) {
  console.log('\n📋 Seeding orders...');
  const createdOrders = [];

  // Get demo client user ID
  const { data: clientUser } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('email', 'client@demo3pl.com')
    .single();

  if (!clientUser) {
    console.error('  ❌ Demo client user not found!');
    return createdOrders;
  }

  for (const orderData of sampleOrders) {
    // Create order
    const orderRecord = {
      client_id: DEMO_CLIENT_ID,
      status: orderData.status,
      priority: orderData.priority,
      notes: orderData.notes,
      delivery_address_name: 'John Doe',
      delivery_address_phone: '555-0123',
      delivery_address_street: '123 Main St',
      delivery_address_city: 'San Francisco',
      delivery_address_state: 'CA',
      delivery_address_zip_code: '94102',
      delivery_address_country: 'United States',
      created_by: clientUser.id
    };

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderRecord)
      .select()
      .single();

    if (orderError) {
      console.error(`  ❌ Error creating order:`, orderError.message);
      continue;
    }

    console.log(`  ✅ Created order: ${order.id} (${orderData.status})`);

    // Create order items
    let totalAmount = 0;
    for (const item of orderData.items) {
      const product = products[item.productIndex];
      if (!product) continue;

      const itemTotal = item.quantity * item.unitPrice;
      totalAmount += itemTotal;

      const { error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: order.id,
          product_id: product.id,
          quantity: item.quantity,
          unit_price: item.unitPrice
        });

      if (itemError) {
        console.error(`  ⚠️  Error creating order item:`, itemError.message);
      }
    }

    // Update order total
    await supabase
      .from('orders')
      .update({ total_amount: totalAmount })
      .eq('id', order.id);

    createdOrders.push(order);
  }

  return createdOrders;
}

async function seedInvoices(orders) {
  console.log('\n💰 Seeding invoices...');
  const createdInvoices = [];

  // Only create invoices for delivered/completed orders
  const completedOrders = orders.filter(o => o.status === 'delivered' || o.status === 'shipped');

  for (const order of completedOrders) {
    // Check if invoice already exists
    const { data: existing } = await supabase
      .from('invoices')
      .select('id')
      .eq('order_id', order.id)
      .single();

    if (existing) {
      console.log(`  ⏭️  Invoice for order ${order.id} already exists, skipping...`);
      continue;
    }

    const invoiceData = {
      client_id: DEMO_CLIENT_ID,
      order_id: order.id,
      invoice_number: `INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
      type: 'outbound',
      status: 'paid',
      subtotal: order.total_amount || 0,
      amount: order.total_amount || 0,
      tax_amount: (order.total_amount || 0) * 0.08, // 8% tax
      tax_rate: 8,
      total_amount: (order.total_amount || 0) * 1.08,
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 30 days from now
      paid_date: new Date().toISOString().split('T')[0]
    };

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert(invoiceData)
      .select()
      .single();

    if (error) {
      console.error(`  ❌ Error creating invoice:`, error.message);
      continue;
    }

    console.log(`  ✅ Created invoice: ${invoice.invoice_number}`);
    createdInvoices.push(invoice);
  }

  return createdInvoices;
}

async function run() {
  try {
    console.log('🌱 Starting Demo Data Seeding...\n');
    console.log(`📌 Target Client ID: ${DEMO_CLIENT_ID}\n`);

    // Verify connection
    const { error: testError } = await supabase.from('clients').select('id').limit(1);
    if (testError) {
      console.error('❌ Cannot connect to Supabase:', testError.message);
      process.exit(1);
    }

    // Seed products and inventory
    const products = await seedProducts();
    console.log(`\n✅ Created/verified ${products.length} products`);

    // Seed orders
    const orders = await seedOrders(products);
    console.log(`\n✅ Created ${orders.length} orders`);

    // Seed invoices
    const invoices = await seedInvoices(orders);
    console.log(`\n✅ Created ${invoices.length} invoices`);

    console.log('\n🎉 Demo data seeding completed successfully!\n');
    console.log('📊 Summary:');
    console.log(`   - Products: ${products.length}`);
    console.log(`   - Orders: ${orders.length}`);
    console.log(`   - Invoices: ${invoices.length}`);
    console.log('\n💡 You can now log in as client@demo3pl.com to see the demo data!\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error seeding demo data:', error.message || error);
    if (error.stack) console.error(error.stack);
    process.exit(1);
  }
}

run();
