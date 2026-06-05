export interface FAQDTO {
    id: string;
    companyId: string;
    propertyId: string;
    question: string;
    answer: string;
    order: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateFAQParams {
    userId: string;
    companyId: string;
    propertyId: string;
    question: string;
    answer: string;
    order?: number;
    isActive?: boolean;
}

export interface UpdateFAQParams {
    userId: string;
    companyId: string;
    faqId: string;
    question?: string;
    answer?: string;
    order?: number;
    isActive?: boolean;
}