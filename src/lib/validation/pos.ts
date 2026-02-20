import { z } from 'zod';

export const saleSchema = z.object({
    items: z.array(z.object({
        id: z.string(),
        quantity: z.number().min(1, "Quantity must be at least 1"),
        price: z.number().min(0, "Price cannot be negative")
    })).min(1, "Cart cannot be empty"),
    paymentMethod: z.string().min(1, "Payment method is required"),
    totalAmount: z.number().min(0),
    payments: z.array(z.object({
        method: z.string(),
        amount: z.number()
    })).optional(),
    customer: z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional()
    }).optional()
});

export const paymentSchema = z.object({
    ticketId: z.string().min(1, "Ticket ID is required"),
    amount: z.number().min(0.01, "Amount must be positive"),
    method: z.enum(['CASH', 'CARD', 'TRANSFER', 'SPLIT']),
    reference: z.string().optional()
});
