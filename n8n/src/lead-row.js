// One row for the Leads sheet (matched on ig_user_id, so no duplicates).
return [{ json: $('Record Result').first().json.lead }];
