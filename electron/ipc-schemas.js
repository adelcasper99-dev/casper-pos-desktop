const { z } = require('zod');

const PrintStandardSchema = z.tuple([
    z.string().max(200000, 'HTML payload too large (max 200KB)'),
    z.string().min(1, 'Printer name is required'),
    z.any().optional()
]);

const PrintThermalSchema = z.tuple([
    z.string().max(200000, 'HTML payload too large (max 200KB)'),
    z.string().min(1, 'Printer name is required'),
    z.number().int().min(40).max(300)
]);

const KickDrawerSchema = z.tuple([
    z.string().optional()
]);

const SaveCloudConfigSchema = z.tuple([
    z.object({
        enabled: z.boolean(),
        cloudUrl: z.string().url().or(z.literal('')),
        branchId: z.string(),
        syncSecret: z.string(),
    })
]);

const SaveNodeConfigSchema = z.tuple([
    z.object({
        nodeRole: z.string(),
        masterIp: z.string().or(z.literal('')),
    })
]);

const SaveConfigAndRestartSchema = z.tuple([
    z.string().min(1)
]);

const OpenExternalSchema = z.tuple([
    z.string().url()
]);

const SendMessageSchema = z.tuple([
    z.string(),
    z.string()
]);

module.exports = {
    PrintStandardSchema,
    PrintThermalSchema,
    KickDrawerSchema,
    SaveCloudConfigSchema,
    SaveNodeConfigSchema,
    SaveConfigAndRestartSchema,
    OpenExternalSchema,
    SendMessageSchema
};
