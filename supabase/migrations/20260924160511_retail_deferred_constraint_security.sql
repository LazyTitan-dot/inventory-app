-- Deferred constraints can run after the SECURITY DEFINER command has returned,
-- when the caller is again authenticated and has no direct access to retail tables.
-- Preserve the existing empty search_path and keep this trigger-only helper private.
alter function retail_private.check_document_totals() security definer;
revoke all on function retail_private.check_document_totals() from public,anon,authenticated;
