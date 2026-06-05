import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import router from "./routes";
import { embedRedirectHandler, widgetScriptHandler } from "./widget";
import { notFoundHandler } from "./middlewares/notFound";
import { errorHandler } from "./middlewares/errorHandler";
import { xssSanitizer } from "./middlewares/sanitization";
import { responseContractMiddleware } from "./middlewares/responseContractMiddleware";
import { csrfProtectionMiddleware } from "./middlewares/csrfProtectionMiddleware";
import { config, isOriginAllowed } from "./config";
import { healthCheckHandler } from "./controllers/healthController";
import path from "node:path";

const app = express();

if (config.server.trustProxy) {
  app.set("trust proxy", 1);
}

app.use(helmet({ contentSecurityPolicy: false }));

const strictCors = cors({
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked origin: ${origin}`));
    }
  },
  credentials: config.cors.credentials,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Cookie"],
  exposedHeaders: ["Content-Type", "Authorization"],
});

const widgetPublicCors = cors({
  origin: true,
  credentials: false,
  methods: ["GET", "POST", "OPTIONS"],
});

// CORS must run before body parsers so that error responses (e.g. 413) include CORS headers
app.use((req, res, next) => {
  const normalizedPath = req.path.replace(/\/+$/, "");
  const isWidgetSettingsRoute = /^\/api\/properties\/widget\/[^/]+\/settings$/.test(normalizedPath);
  const isWidgetVerifyRoute = normalizedPath === "/api/widget/verify";
  const isAttachmentsVisitorRoute = normalizedPath === "/api/attachments/visitor";

  if (isWidgetSettingsRoute || isWidgetVerifyRoute || isAttachmentsVisitorRoute) {
    return widgetPublicCors(req, res, next);
  }

  return strictCors(req, res, next);
});

app.use(express.json({ limit: config.express.jsonLimit }));
app.use(express.urlencoded({ extended: false, limit: config.express.bodyLimit }));

app.use(cookieParser());

app.use(xssSanitizer);

app.use(responseContractMiddleware);

// use for static files and also setHeaders for security sent pdf with html and scripts embedded
app.use(
  `/${config.express.staticPath}`,
  express.static(path.resolve(process.cwd(), config.express.staticPath), {
    index: false,
    redirect: false,
    setHeaders: (res) => {
      res.setHeader("X-Content-Type-Options", "nosniff");
    },
  })
);

app.get("/health", healthCheckHandler);

app.get("/widget.js",
  helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }),
  widgetScriptHandler
);

app.get("/embed",
  helmet({
    frameguard: false,
    contentSecurityPolicy: false,
    // or a CSP that fits your embed page
    // only disable COOP/COEP here if you actually see breakage:
    // crossOriginOpenerPolicy: false,
    // crossOriginEmbedderPolicy: false,
  }),
  embedRedirectHandler
);

app.use("/api", csrfProtectionMiddleware, router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
