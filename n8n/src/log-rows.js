// Incoming message + assistant reply for the Messages sheet.
return $('Record Result').first().json.logRows.map(row => ({ json: row }));
