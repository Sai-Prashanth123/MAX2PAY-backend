const supabaseAdmin = require('../config/supabaseAdmin');
const { generateMonthlyInvoice } = require('../services/invoiceGenerationService');

/**
 * Automated Monthly Invoice Generation Controller
 * 
 * This controller handles automated invoice generation triggered by cron jobs.
 * It processes all active clients and generates invoices for the previous month.
 * 
 * Timezone Handling:
 * - All date calculations use America/New_York timezone (EST/EDT)
 * - Automatically handles Daylight Saving Time transitions
 * - Cron runs on 1st of month at 02:00 AM EST
 * - Billing period is always the PREVIOUS month
 */

/**
 * Generate monthly invoices for all active clients
 * This is the main automated invoice generation endpoint
 * 
 * Security: Protected by internal service authentication
 * Idempotency: Safe to run multiple times - skips existing invoices
 * 
 * @route POST /api/invoices/generate-monthly-auto
 */
exports.generateMonthlyInvoicesAuto = async (req, res, next) => {
  const startTime = Date.now();
  
  // Internal service authentication check
  const serviceKey = req.headers['x-service-key'];
  const expectedKey = process.env.INTERNAL_SERVICE_KEY || 'your-secure-internal-key-change-in-production';
  
  if (serviceKey !== expectedKey) {
    console.error('❌ Unauthorized auto-invoice generation attempt');
    return res.status(401).json({
      success: false,
      message: 'Unauthorized: Invalid service key'
    });
  }

  console.log('\n========================================');
  console.log('🤖 AUTOMATED MONTHLY INVOICE GENERATION');
  console.log('========================================');
  console.log(`Started at: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);

  try {
    // Calculate previous month in America/New_York timezone
    // This ensures we always bill the correct month regardless of DST
    const now = new Date();
    const nyDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    // Get previous month
    const previousMonth = new Date(nyDate);
    previousMonth.setMonth(previousMonth.getMonth() - 1);
    
    const billingMonth = previousMonth.getMonth() + 1; // 1-12
    const billingYear = previousMonth.getFullYear();
    
    console.log(`📅 Billing Period: ${getMonthName(billingMonth)} ${billingYear}`);
    console.log(`🕐 Current NY Time: ${nyDate.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
    console.log(`🌍 Timezone: America/New_York (${isDST(nyDate) ? 'EDT' : 'EST'})`);

    // Fetch all active clients
    const { data: clients, error: clientError } = await supabaseAdmin
      .from('clients')
      .select('id, company_name, email, is_active')
      .eq('is_active', true)
      .order('company_name');

    if (clientError) {
      throw new Error(`Failed to fetch clients: ${clientError.message}`);
    }

    if (!clients || clients.length === 0) {
      console.log('⚠️  No active clients found');
      return res.status(200).json({
        success: true,
        message: 'No active clients to process',
        results: []
      });
    }

    console.log(`👥 Processing ${clients.length} active clients...\n`);

    // Process each client independently
    const results = [];
    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const client of clients) {
      const clientStartTime = Date.now();
      
      try {
        console.log(`\n📋 Processing: ${client.company_name} (${client.id.slice(-8)})`);
        
        // Generate invoice using reusable service
        // userId is set to 'system' for automated generation
        const result = await generateMonthlyInvoice(
          client.id,
          billingMonth,
          billingYear,
          'system',
          true // isDraft = true for auto-generated invoices
        );

        const duration = Date.now() - clientStartTime;

        if (result.success) {
          successCount++;
          console.log(`   ✅ Invoice generated: ${result.data.invoice_number}`);
          console.log(`   💰 Amount: $${result.stats.totalAmount.toFixed(2)}`);
          console.log(`   📦 Orders: ${result.stats.orderCount}`);
          console.log(`   ⏱️  Duration: ${duration}ms`);
          
          results.push({
            clientId: client.id,
            clientName: client.company_name,
            status: 'success',
            invoiceNumber: result.data.invoice_number,
            amount: result.stats.totalAmount,
            orderCount: result.stats.orderCount,
            duration: duration
          });
        } else if (result.skipped) {
          skippedCount++;
          console.log(`   ⏭️  Skipped: ${result.reason}`);
          console.log(`   ℹ️  ${result.message}`);
          console.log(`   ⏱️  Duration: ${duration}ms`);
          
          results.push({
            clientId: client.id,
            clientName: client.company_name,
            status: 'skipped',
            reason: result.reason,
            message: result.message,
            duration: duration
          });
        } else {
          errorCount++;
          console.error(`   ❌ Error: ${result.message}`);
          console.log(`   ⏱️  Duration: ${duration}ms`);
          
          results.push({
            clientId: client.id,
            clientName: client.company_name,
            status: 'error',
            error: result.message,
            duration: duration
          });
        }

      } catch (error) {
        errorCount++;
        const duration = Date.now() - clientStartTime;
        
        console.error(`   ❌ Unexpected error: ${error.message}`);
        console.log(`   ⏱️  Duration: ${duration}ms`);
        
        results.push({
          clientId: client.id,
          clientName: client.company_name,
          status: 'error',
          error: error.message,
          duration: duration
        });
        
        // Continue processing other clients even if one fails
        continue;
      }
    }

    const totalDuration = Date.now() - startTime;

    // Summary
    console.log('\n========================================');
    console.log('📊 GENERATION SUMMARY');
    console.log('========================================');
    console.log(`✅ Successful: ${successCount}`);
    console.log(`⏭️  Skipped: ${skippedCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`⏱️  Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
    console.log(`🏁 Completed at: ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST`);
    console.log('========================================\n');

    // Return comprehensive results
    res.status(200).json({
      success: true,
      message: 'Automated invoice generation completed',
      billingPeriod: {
        month: billingMonth,
        year: billingYear,
        monthName: getMonthName(billingMonth)
      },
      summary: {
        totalClients: clients.length,
        successful: successCount,
        skipped: skippedCount,
        errors: errorCount,
        duration: totalDuration
      },
      results: results,
      timestamp: new Date().toISOString(),
      timezone: 'America/New_York'
    });

  } catch (error) {
    console.error('\n❌ FATAL ERROR IN AUTO-GENERATION:');
    console.error(error);
    
    next(error);
  }
};

/**
 * Manual trigger for testing automated invoice generation
 * Allows testing the auto-generation logic without waiting for cron
 * 
 * @route POST /api/invoices/test-auto-generation
 */
exports.testAutoGeneration = async (req, res, next) => {
  console.log('\n🧪 TEST MODE: Manual trigger of auto-generation');
  
  // Reuse the main auto-generation logic
  return exports.generateMonthlyInvoicesAuto(req, res, next);
};

/**
 * Get month name from number
 */
const getMonthName = (month) => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  return months[month - 1] || month;
};

/**
 * Check if a date is in Daylight Saving Time
 * DST in America/New_York: Second Sunday in March to First Sunday in November
 */
const isDST = (date) => {
  const jan = new Date(date.getFullYear(), 0, 1);
  const jul = new Date(date.getFullYear(), 6, 1);
  const stdOffset = Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  return date.getTimezoneOffset() < stdOffset;
};
