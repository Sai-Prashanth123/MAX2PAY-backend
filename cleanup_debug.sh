#!/bin/bash
# Automated Debug Logging Cleanup Script

echo "🧹 Cleaning up debug logging..."

# Remove debug log blocks from supabaseAuthController.js
sed -i.bak '/\/\/ #region agent log/,/\/\/ #endregion/d' controllers/supabaseAuthController.js

# Remove debug log blocks from orderRoutes.js
sed -i.bak '/\/\/ #region agent log/,/\/\/ #endregion/d' routes/orderRoutes.js

# Remove debug log blocks from server.js
sed -i.bak '/\/\/ #region agent log/,/\/\/ #endregion/d' server.js

# Remove backup files
rm -f controllers/supabaseAuthController.js.bak
rm -f routes/orderRoutes.js.bak
rm -f server.js.bak

echo "✅ Debug logging cleanup complete!"
echo ""
echo "Verifying cleanup..."
echo "Remaining DEBUG_LOG_PATH references:"
grep -r "DEBUG_LOG_PATH" controllers/ routes/ server.js 2>/dev/null | wc -l
echo "Remaining debugLog calls:"
grep -r "debugLog(" controllers/ routes/ server.js 2>/dev/null | wc -l
echo "Remaining #region agent log:"
grep -r "#region agent log" controllers/ routes/ server.js 2>/dev/null | wc -l
echo ""
echo "If all counts are 0, cleanup is successful!"
