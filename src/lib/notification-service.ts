import { prisma } from "@/lib/prisma";
import { getStatusTemplate } from "./whatsapp-templates";
import { logger } from "./logger";

/**
 * Intelligence-Aware Notification Service for Maintenance Tickets
 */
export class NotificationService {
    /**
     * Sends a ticket status notification asynchronously.
     * Fires and forgets to avoid blocking the main database transaction.
     */
    static async sendTicketStatusNotification(ticketId: string, status: string) {
        // We do not await this, allowing the caller (server action) to finish and respond to the UI.
        this.processNotification(ticketId, status).catch(err => {
            logger.error(`[NotificationService] Critical background error:`, err);
        });
    }

    /**
     * Core processing logic for notifications with intelligence metrics snapshots
     */
    private static async processNotification(ticketId: string, status: string) {
        try {
            // 1. Fetch Ticket with Customer and Branch
            const ticket = await prisma.ticket.findUnique({
                where: { id: ticketId },
                include: {
                    customer: true,
                    currentBranch: true
                }
            });

            if (!ticket) {
                logger.warn(`[NotificationService] Ticket not found: ${ticketId}`);
                return;
            }

            const customer = ticket.customer;
            if (!customer || !customer.phone) {
                logger.info(`[NotificationService] No customer phone for ticket ${ticket.barcode}`);
                return;
            }

            // 2. Opt-out & Compliance Check
            // Check the new preference field added to the schema
            if (customer.receivesNotifications === false) {
                logger.info(`[NotificationService] Customer ${customer.name} has opted out of notifications.`);
                return;
            }

            // 3. Fetch Store Environment Context
            const settings = await prisma.storeSettings.findUnique({ where: { id: 'settings' } });
            const storeName = settings?.name || "Casper Store";

            // 4. Intelligence Metrics snapshots (Snapshots Gaps & Risks at notify-time)
            const now = new Date();
            const lastUpdate = new Date(ticket.updatedAt);
            const gapMs = now.getTime() - lastUpdate.getTime();
            const gapHours = Math.floor(gapMs / (1000 * 60 * 60));
            


            const metadata = {
                gapHours,
                storeName,
                triggeredStatus: status,
                timestamp: now.toISOString()
            };

            // 5. Template Engine Integration
            const template = getStatusTemplate(status);
            if (!template) {
                console.warn(`[Notification] No template found for status ${status}. Skipping...`);
                return { success: false, message: 'No template configured for this status' };
            }
            
            const replacements: Record<string, string> = {
                name: customer.name,
                device: `${ticket.deviceBrand} ${ticket.deviceModel}`,
                barcode: ticket.barcode,
                price: ticket.repairPrice.toString(),
                branch: ticket.currentBranch.name,
                issue: ticket.issueDescription || "",
                notes: ticket.conditionNotes || "",
                store: storeName
            };

            let message = template;
            for (const [key, value] of Object.entries(replacements)) {
                message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
            }

            // 6. Persistence: Log the notification attempt with Intelligence Metadata
            const logEntry = await prisma.notificationLog.create({
                data: {
                    ticketId,
                    type: 'WHATSAPP',
                    status: 'QUEUED',
                    metadata: JSON.stringify(metadata)
                }
            });

            // 7. Mock Async Dispatch (Plug-and-play ready for UltraMsg/Twilio)
            const dispatchPayload = {
                to: customer.phone,
                body: message,
                metadata
            };

            logger.info(`[NotificationService] Initiating dispatch to ${customer.phone}`, {
                barcode: ticket.barcode,
                status: status,
            });

            // Simulate the external API delay
            setTimeout(async () => {
                try {
                    // Logic for real provider integration goes here:
                    // const apiResponse = await fetch(process.env.WHATSAPP_PROVIDER_URL, { ... })

                    // Mark as SENT in the database
                    await prisma.notificationLog.update({
                       where: { id: logEntry.id },
                       data: { status: 'SENT' }
                    });
                    
                    logger.info(`[NotificationService] Notification SENT for ${ticket.barcode}`);
                } catch (dispatchError) {
                    logger.error(`[NotificationService] Dispatch failed for ${ticket.barcode}`, dispatchError);
                    await prisma.notificationLog.update({
                        where: { id: logEntry.id },
                        data: { status: 'FAILED' }
                     });
                }
            }, 1500);

        } catch (error) {
            logger.error(`[NotificationService] Process failed:`, error);
        }
    }
}
