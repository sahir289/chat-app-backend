export const applyLeadMasking = (
    leads: any[],
    skip: number,
    isPro: boolean
) => {
    return leads.map((lead, index) => {
        const globalIndex = skip + index;

        if (!isPro && globalIndex >= 10) {
            return {
                ...lead,
                email: "***@***.***",
                phone: lead.phone ? "***-***-****" : null,
                isBlurred: true,
            };
        }

        return { ...lead, isBlurred: false };
    });
};
