-- Enable RLS on Sale table
ALTER TABLE "Sale" ENABLE ROW LEVEL SECURITY;

-- Create policy for tenant isolation
CREATE POLICY tenant_isolation ON "Sale" 
USING (
    "tenantId" = current_setting('app.current_tenant_id', true)
    OR current_setting('app.current_tenant_id', true) = 'SYSTEM'
);
