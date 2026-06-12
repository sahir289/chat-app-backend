import { Router } from "express";
import propertiesRouter from "./properties";
import chatRouter from "./chat";
import dashboardRouter from "./dashboard";
import leadRouter from "./lead";
import knowledgeRouter from "./knowledge";
import authRouter from "./authRoutes";
import teamRouter from "./teamRoutes";
import companyRouter from "./company";
import visitorRouter from "./visitor";
import analyticsRouter from "./analytics";
import aiRouter from "./ai";
import usersRouter from "./users";
import widgetRouter from "./widget";
import chatsRouter from "./chats";
import messagesRouter from "./messages";
import subscriptionRouter from "./subscription";
import upgradeRequestRouter from "./upgradeRequest";
import webhookRouter from "./webhook";
import chatRatingRouter from "./chatRating";
import attachmentRouter from "./attachment";
import faqRouter from "./faq";
import quickReplyRouter from "./quickReply";
import chatbotFlowRouter from "./chatbotFlow";
import superAdminSubscriptionsRouter from "./superAdmin/subscriptions";
import superAdminModulesRouter from "./superAdmin/modules";
import superAdminUsersRouter from "./superAdmin/users";
import superAdminOpenAiRouter from "./superAdmin/openai";
import superAdminStatsRouter from "./superAdmin/stats";
import superAdminLeadsRouter from "./superAdmin/leads";
import superAdminWebsiteAnalyticsRouter from "./superAdmin/websiteAnalytics";
import websiteAnalyticsTrackRouter from "./websiteAnalyticsTrack";
import twoFactorRouter from "./twoFactorRoutes";
import featureAccessRouter from "./featureAccess";
import moduleAccessRouter from "./moduleAccess";
import crmRouter from "./crm";

const router = Router();

router.use("/widget", widgetRouter);

router.use("/auth", authRouter);

router.use("/auth/2fa", twoFactorRouter);

router.use("/company", companyRouter);

router.use("/users", usersRouter);

router.use("/properties", propertiesRouter);

router.use("/visitors", visitorRouter);

router.use("/chats", chatsRouter);

router.use("/messages", messagesRouter);

router.use("/leads", leadRouter);

router.use("/knowledge", knowledgeRouter);

router.use("/analytics", analyticsRouter);

router.use("/ai", aiRouter);

router.use("/dashboard", dashboardRouter);

router.use("/chat", chatRouter);

router.use("/team", teamRouter);

router.use("/subscriptions", subscriptionRouter);

router.use("/upgrade-requests", upgradeRequestRouter);

router.use("/webhooks", webhookRouter);

router.use("/chat-ratings", chatRatingRouter);

router.use("/attachments", attachmentRouter);

router.use("/faqs", faqRouter);
router.use("/quick-replies", quickReplyRouter);
router.use("/chatbot-flows", chatbotFlowRouter);

router.use("/super-admin/subscriptions", superAdminSubscriptionsRouter);

router.use("/super-admin/modules", superAdminModulesRouter);

router.use("/super-admin/users", superAdminUsersRouter);

router.use("/super-admin/openai", superAdminOpenAiRouter);

router.use("/super-admin/stats", superAdminStatsRouter);

router.use("/super-admin/leads", superAdminLeadsRouter);

router.use("/super-admin/website-analytics", superAdminWebsiteAnalyticsRouter);

router.use("/analytics", websiteAnalyticsTrackRouter);

router.use("/feature-access", featureAccessRouter);

router.use("/module-access", moduleAccessRouter);

router.use("/crm", crmRouter);

export default router;

