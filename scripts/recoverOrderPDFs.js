/**
 * Recovery Script: Link PDF files to orders that were created without attachment_url
 * 
 * This script attempts to match PDF files in the uploads directory to orders
 * based on creation timestamps. Run this AFTER running the migration to add
 * the attachment_url column.
 * 
 * Usage: node scripts/recoverOrderPDFs.js
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env file');
  console.error('Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function recoverOrderPDFs() {
  try {
    console.log('🔍 Starting PDF recovery process...\n');

    // 1. Get all orders without attachment_url
    const { data: ordersWithoutPDF, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_number, created_at')
      .is('attachment_url', null)
      .order('created_at', { ascending: false });

    if (ordersError) {
      console.error('❌ Error fetching orders:', ordersError.message);
      return;
    }

    if (!ordersWithoutPDF || ordersWithoutPDF.length === 0) {
      console.log('✅ No orders found without PDF attachments.');
      return;
    }

    console.log(`📋 Found ${ordersWithoutPDF.length} orders without PDF attachments\n`);

    // 2. Get all PDF files in uploads directory
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      console.error('❌ Uploads directory not found:', uploadsDir);
      return;
    }

    const files = fs.readdirSync(uploadsDir)
      .filter(file => file.startsWith('attachment-') && file.endsWith('.pdf'))
      .map(file => {
        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);
        return {
          filename: file,
          path: `uploads/${file}`,
          created: stats.birthtime,
          modified: stats.mtime
        };
      })
      .sort((a, b) => b.created - a.created); // Most recent first

    console.log(`📁 Found ${files.length} PDF files in uploads directory\n`);

    if (files.length === 0) {
      console.log('⚠️  No PDF files found to recover.');
      return;
    }

    // 3. Try to match PDFs to orders based on creation time
    // Match if PDF was created within 5 minutes of order creation
    const MATCH_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
    let matchedCount = 0;
    let unmatchedOrders = [];
    let unmatchedPDFs = [...files];

    for (const order of ordersWithoutPDF) {
      const orderCreatedAt = new Date(order.created_at);
      let bestMatch = null;
      let bestTimeDiff = Infinity;

      // Find the PDF created closest to the order creation time
      for (let i = unmatchedPDFs.length - 1; i >= 0; i--) {
        const pdf = unmatchedPDFs[i];
        const pdfCreatedAt = pdf.created;
        const timeDiff = Math.abs(orderCreatedAt - pdfCreatedAt);

        if (timeDiff <= MATCH_WINDOW_MS && timeDiff < bestTimeDiff) {
          bestMatch = pdf;
          bestTimeDiff = timeDiff;
        }
      }

      if (bestMatch) {
        // Update order with PDF path
        const { error: updateError } = await supabase
          .from('orders')
          .update({ attachment_url: bestMatch.path })
          .eq('id', order.id);

        if (updateError) {
          console.error(`❌ Failed to update order ${order.order_number}:`, updateError.message);
          unmatchedOrders.push(order);
        } else {
          console.log(`✅ Matched PDF ${bestMatch.filename} to order ${order.order_number} (${Math.round(bestTimeDiff / 1000)}s difference)`);
          matchedCount++;
          // Remove matched PDF from unmatched list
          unmatchedPDFs = unmatchedPDFs.filter(p => p.filename !== bestMatch.filename);
        }
      } else {
        unmatchedOrders.push(order);
      }
    }

    // 4. Summary
    console.log('\n📊 Recovery Summary:');
    console.log(`   ✅ Matched: ${matchedCount} orders`);
    console.log(`   ⚠️  Unmatched orders: ${unmatchedOrders.length}`);
    console.log(`   📁 Unmatched PDFs: ${unmatchedPDFs.length}`);

    if (unmatchedOrders.length > 0) {
      console.log('\n⚠️  Orders that could not be matched:');
      unmatchedOrders.forEach(order => {
        console.log(`   - ${order.order_number} (created: ${new Date(order.created_at).toLocaleString()})`);
      });
    }

    if (unmatchedPDFs.length > 0 && unmatchedOrders.length > 0) {
      console.log('\n💡 Tip: You can manually link PDFs to orders using:');
      console.log('   UPDATE orders SET attachment_url = \'uploads/FILENAME.pdf\' WHERE id = \'ORDER_ID\';');
    }

    console.log('\n✅ Recovery process completed!');
  } catch (error) {
    console.error('❌ Error during recovery:', error);
  }
}

// Run the recovery
recoverOrderPDFs()
  .then(() => {
    console.log('\n✨ Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
