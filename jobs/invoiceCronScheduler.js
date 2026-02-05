const cron = require('node-cron');
const axios = require('axios');

/**
 * AUTOMATED MONTHLY INVOICE GENERATION CRON SCHEDULER
 * 
 * Schedule: 1st of every month at 02:00 AM America/New_York (EST/EDT)
 * Timezone: America/New_York (automatically handles DST transitions)
 * 
 * Cron Expression: '0 2 1 * *'
 * - Minute: 0
 * - Hour: 2 (02:00 AM)
 * - Day of Month: 1 (first day)
 * - Month: * (every month)
 * - Day of Week: * (any day)
 * 
 * DST Handling:
 * - node-cron with timezone option automatically adjusts for DST
 * - During DST (March-November): Runs at 02:00 AM EDT (UTC-4)
 * - During Standard Time (November-March): Runs at 02:00 AM EST (UTC-5)
 * - No manual adjustment needed - cron library handles this
 * 
 * Why 02:00 AM?
 * - Low traffic time
 * - Ensures previous month data is finalized
 * - Allows time for any delayed order status updates
 * - Gives buffer before business hours start
 */

let cronJob = null;

/**
 * Initialize the cron scheduler
 */
const initializeInvoiceCron = () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';
  const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'your-secure-internal-key-change-in-production';

  console.log('\n========================================');
  console.log('🕐 INITIALIZING INVOICE CRON SCHEDULER');
  console.log('========================================');
  console.log('Schedule: 1st of every month at 02:00 AM EST/EDT');
  console.log('Timezone: America/New_York');
  console.log('Cron Expression: 0 2 1 * *');
  console.log('========================================\n');

  // Validate cron expression
  if (!cron.validate('0 2 1 * *')) {
    console.error('❌ Invalid cron expression');
    return;
  }

  // Create cron job with America/New_York timezone
  cronJob = cron.schedule(
    '0 2 1 * *', // Every 1st of month at 02:00 AM
    async () => {
      const nyTime = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
      
      console.log('\n========================================');
      console.log('🚀 CRON JOB TRIGGERED');
      console.log('========================================');
      console.log(`Time: ${nyTime} (America/New_York)`);
      console.log(`UTC: ${new Date().toISOString()}`);
      console.log('========================================\n');

      try {
        // Call the internal auto-generation endpoint
        const response = await axios.post(
          `${BACKEND_URL}/api/invoices/generate-monthly-auto`,
          {},
          {
            headers: {
              'x-service-key': INTERNAL_SERVICE_KEY,
              'Content-Type': 'application/json'
            },
            timeout: 300000 // 5 minute timeout for large batches
          }
        );

        if (response.data.success) {
          console.log('✅ CRON JOB COMPLETED SUCCESSFULLY');
          console.log(`📊 Summary: ${response.data.summary.successful} successful, ${response.data.summary.skipped} skipped, ${response.data.summary.errors} errors`);
        } else {
          console.error('⚠️ CRON JOB COMPLETED WITH WARNINGS');
          console.error(response.data.message);
        }

      } catch (error) {
        console.error('\n❌ CRON JOB FAILED');
        console.error('Error:', error.message);
        
        if (error.response) {
          console.error('Status:', error.response.status);
          console.error('Data:', error.response.data);
        }
        
        // Log error but don't crash the server
        // The cron will retry next month
      }

      console.log('\n========================================');
      console.log('🏁 CRON JOB FINISHED');
      console.log('========================================\n');
    },
    {
      scheduled: true,
      timezone: 'America/New_York' // Critical: Ensures DST is handled correctly
    }
  );

  console.log('✅ Invoice cron scheduler initialized successfully');
  console.log(`📅 Next run: ${getNextCronRun()}\n`);
};

/**
 * Stop the cron scheduler (for graceful shutdown)
 */
const stopInvoiceCron = () => {
  if (cronJob) {
    cronJob.stop();
    console.log('🛑 Invoice cron scheduler stopped');
  }
};

/**
 * Get next scheduled cron run time
 */
const getNextCronRun = () => {
  const now = new Date();
  const nyNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  // Calculate next 1st of month at 02:00 AM
  let nextRun = new Date(nyNow);
  nextRun.setMonth(nextRun.getMonth() + 1);
  nextRun.setDate(1);
  nextRun.setHours(2, 0, 0, 0);
  
  return nextRun.toLocaleString('en-US', { 
    timeZone: 'America/New_York',
    dateStyle: 'full',
    timeStyle: 'long'
  });
};

/**
 * Manual trigger for testing (bypasses cron schedule)
 * Use this for testing the cron logic without waiting
 */
const triggerManualInvoiceGeneration = async () => {
  const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:5001';
  const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || 'your-secure-internal-key-change-in-production';

  console.log('\n🧪 MANUAL TRIGGER: Simulating cron job execution...\n');

  try {
    const response = await axios.post(
      `${BACKEND_URL}/api/invoices/generate-monthly-auto`,
      {},
      {
        headers: {
          'x-service-key': INTERNAL_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 300000
      }
    );

    console.log('✅ Manual trigger completed');
    return response.data;
  } catch (error) {
    console.error('❌ Manual trigger failed:', error.message);
    throw error;
  }
};

module.exports = {
  initializeInvoiceCron,
  stopInvoiceCron,
  triggerManualInvoiceGeneration,
  getNextCronRun
};
