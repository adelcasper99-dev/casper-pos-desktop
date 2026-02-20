export function getDateRangeFromPreset(preset: string, from?: string, to?: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let startDate = startOfToday;
    let endDate = endOfToday;

    switch (preset) {
        case 'yesterday':
            startDate = new Date(startOfToday);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(endOfToday);
            endDate.setDate(endDate.getDate() - 1);
            break;
        case '7d':
            startDate = new Date(startOfToday);
            startDate.setDate(startDate.getDate() - 7);
            break;
        case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'custom':
            if (from) startDate = new Date(from);
            if (to) {
                endDate = new Date(to);
                endDate.setHours(23, 59, 59, 999);
            }
            break;
        case 'today':
        default:
            startDate = startOfToday;
            endDate = endOfToday;
            break;
    }

    return { startDate, endDate };
}
