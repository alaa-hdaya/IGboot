// Emails the team only when a person is needed (returns nothing otherwise).
const r = $('Record Result').first().json;
if (!r.notify) return [];
return [{ json: r.email }];
