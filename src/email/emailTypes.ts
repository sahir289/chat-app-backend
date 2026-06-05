export interface SendEmailInput {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    from?: string;
}

export interface EmailTemplateResult {
    subject: string;
    html: string;
    text?: string;
}

export interface BaseTemplateProps {
    platformName?: string;
}

export interface VerifyEmailTemplateProps extends BaseTemplateProps {
    name: string;
    verificationLink: string;
}

export interface ResetPasswordTemplateProps extends BaseTemplateProps {
    name: string;
    resetLink: string;
}

export interface PasswordChangedTemplateProps extends BaseTemplateProps {
    name: string;
}

export interface InviteUserTemplateProps extends BaseTemplateProps {
    name: string;
    inviteLink: string;
}

export interface WelcomeEmailTemplateProps extends BaseTemplateProps {
    name: string;
    companyName: string;
    isPro: boolean;
}

export interface ProRequestThankYouTemplateProps extends BaseTemplateProps {
    name: string;
    companyName: string;
}

export interface ProRequestNotificationTemplateProps extends BaseTemplateProps {
    requestData: {
        name: string;
        companyName: string;
        email: string;
        phone?: string | null;
        message?: string | null;
    };
}

export interface ProApprovalTemplateProps extends BaseTemplateProps {
    name: string;
    companyName: string;
}

export interface ProUpgradeNotificationTemplateProps extends BaseTemplateProps {
    name: string;
    companyName: string;
}

export interface NewUserNotificationTemplateProps extends BaseTemplateProps {
    userData: {
        name: string;
        email: string;
        companyName: string;
        registrationDate: Date;
    };
}

