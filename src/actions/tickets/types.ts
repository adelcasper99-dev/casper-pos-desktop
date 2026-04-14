import { z } from "zod";
import { ticketSchema } from "@/lib/validation/tickets";

export type TicketCreateData = z.infer<typeof ticketSchema> & { 
    csrfToken?: string;
    idempotencyKey?: string;
};

export type TicketUpdateData = {
    ticketId: string;
    updates: {
        customerName?: string;
        customerPhone?: string;
        deviceModel?: string;
        problemDescription?: string;
        repairPrice?: number;
        expectedDuration?: number;
        notes?: string;
    };
    csrfToken?: string;
};
