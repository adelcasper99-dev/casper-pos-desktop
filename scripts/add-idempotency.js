const fs = require('fs');
const path = require('path');

const targetPath = path.join(__dirname, '../src/lib/accounting/auto-journal-service.ts');
let content = fs.readFileSync(targetPath, 'utf8');

const modifications = [
  {
    findParam: /branchId\?\: string;\n    }\n  \)/g,
    replaceParam: "branchId?: string;\n      idempotencyKey?: string;\n    }\n  )",
  },
  {
    // Customer Payment
    findData: /data: {\n        description: params.description \|\| `Customer Payment:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `CUST_PAY_${params.customerTransactionId}`,\n        description: params.description || `Customer Payment:"
  },
  {
    // Ticket Dist
    findData: /data: {\n        description: `Maintenance Distribution:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `TICKET_DIST_${params.ticketId}`,\n        description: `Maintenance Distribution:"
  },
  {
    // Customer Receipt
    findData: /data: {\n        description: params.description \|\| `Customer Receipt:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `CUST_RECPT_${params.customerTransactionId}`,\n        description: params.description || `Customer Receipt:"
  },
  {
    // Customer Credit
    findData: /data: {\n        description: params.description \|\| `Customer Credit:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `CUST_CREDIT_${params.customerTransactionId}`,\n        description: params.description || `Customer Credit:"
  },
  {
    // Supplier Payment
    findData: /data: {\n        description: params.description \|\| `Supplier Payment:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `SUPP_PAY_${params.supplierPaymentId}`,\n        description: params.description || `Supplier Payment:"
  },
  {
    // Supplier Invoice
    findData: /data: {\n        description: params.description \|\| `Supplier Invoice:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `SUPP_INV_${params.supplierPaymentId}`,\n        description: params.description || `Supplier Invoice:"
  },
  {
    // Employee Payment
    findData: /data: {\n        description: params.description \|\| `Employee \$\{params.type\}:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `EMP_PAY_${params.employeeTransactionId}`,\n        description: params.description || `Employee ${params.type}:"
  },
  {
    // Reversal
    findData: /data: {\n        description: `Reversal of #\$\{original.id.slice\(0, 8\)\}:/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `REV_${params.originalEntryId}`,\n        description: `Reversal of #${original.id.slice(0, 8)}:"
  },
  {
    // Wastage Loss - wait, wastage loss has reference? string; params doesn't have referenceId.
    // Let's use Date.now() for Wastage if idempotencyKey is not provided? Or a UUID. We can just use `WASTAGE_${params.reference || Date.now()}`.
    findData: /data: {\n        description: params.description,\n        reference: params.reference,/g,
    replaceData: "data: {\n        idempotencyKey: params.idempotencyKey || `WASTAGE_${params.reference || Date.now()}`,\n        description: params.description,\n        reference: params.reference,"
  }
];

content = content.replace(modifications[0].findParam, modifications[0].replaceParam);

for (let i = 1; i < modifications.length; i++) {
  content = content.replace(modifications[i].findData, modifications[i].replaceData);
}

// Special case for recordWastageLoss params which ends with reference?: string; branchId?: string; }
// Wait, my first regex `/branchId\?\: string;\n    }\n  \)/g` will match ALL of them!
// Because they all end with `branchId?: string;\n    }\n  ) {`

fs.writeFileSync(targetPath, content, 'utf8');
console.log('Successfully updated auto-journal-service.ts');
