import { describe, it, expect } from 'vitest';
import { canTransition } from '../lib/workflow';
import { TicketStatus } from '../lib/constants';
import { PERMISSIONS } from '../lib/permissions';

describe('Workflow Transition Logic (canTransition)', () => {
    it('should default currentBranchType to CENTER and allow transition to DIAGNOSING', () => {
        // When branchType is omitted, it should default to CENTER, allowing transition to DIAGNOSING
        const transitions = canTransition(
            TicketStatus.NEW,
            [PERMISSIONS.TICKET_EDIT],
            {}
        );

        const estimationMove = transitions.find(t => t.target === TicketStatus.DIAGNOSING);
        expect(estimationMove).toBeDefined();
        expect(estimationMove?.allowed).toBe(true);
    });

    it('should block transition to DIAGNOSING if branchType is explicitly STORE', () => {
        // When branchType is explicitly STORE, non-admin users should be blocked from center-only targets
        const transitions = canTransition(
            TicketStatus.NEW,
            [PERMISSIONS.TICKET_EDIT],
            {},
            'STORE',
            'USER'
        );

        const estimationMove = transitions.find(t => t.target === TicketStatus.DIAGNOSING);
        expect(estimationMove).toBeDefined();
        expect(estimationMove?.allowed).toBe(false);
        expect(estimationMove?.reason).toContain('Main Center');
    });

    it('should allow transition to DIAGNOSING even at STORE branch if user is ADMIN', () => {
        // Admin user can transition from anywhere
        const transitions = canTransition(
            TicketStatus.NEW,
            [PERMISSIONS.TICKET_EDIT],
            {},
            'STORE',
            'ADMIN'
        );

        const estimationMove = transitions.find(t => t.target === TicketStatus.DIAGNOSING);
        expect(estimationMove).toBeDefined();
        expect(estimationMove?.allowed).toBe(true);
    });

    it('should allow transition to DIAGNOSING if branchType is explicitly CENTER', () => {
        const transitions = canTransition(
            TicketStatus.NEW,
            [PERMISSIONS.TICKET_EDIT],
            {},
            'CENTER',
            'USER'
        );

        const estimationMove = transitions.find(t => t.target === TicketStatus.DIAGNOSING);
        expect(estimationMove).toBeDefined();
        expect(estimationMove?.allowed).toBe(true);
    });
});
