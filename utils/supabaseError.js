function isMissingTableError(error) {
  const msg = error?.message || '';
  return msg.includes("Could not find the table 'public.") && msg.includes("in the schema cache");
}

function missingTableResponse(error, tables = []) {
  return {
    success: false,
    code: 'SUPABASE_SCHEMA_MISSING',
    message:
      'Supabase tables are not created yet. Run `supabase-schema.sql` in Supabase SQL Editor, then refresh.',
    details: {
      missingTables: tables,
      supabaseMessage: error?.message || null,
    },
  };
}

module.exports = { isMissingTableError, missingTableResponse };

