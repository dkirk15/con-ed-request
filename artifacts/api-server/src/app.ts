import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

// Behind the Replit proxy — trust X-Forwarded-* so req.ip reflects the real
// client IP (and not the proxy address) when auditing signed guarantees.
app.set("trust proxy", true);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy MUST come before express.json()
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Clerk middleware — attaches auth state to all requests
app.use(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  clerkMiddleware(
    (process.env.NODE_ENV === "production"
      ? {
          proxyUrl: (req: express.Request) => {
            const protocol = req.headers["x-forwarded-proto"] || "https";
            const host = getClerkProxyHost(req) || "";
            return `${protocol}://${host}${CLERK_PROXY_PATH}`;
          },
        }
      : {}) as any,
  ),
);

// Tell browsers the response varies by impersonation header so the HTTP
// cache never serves an admin-role response to an impersonated-role request.
app.use("/api", (_req, res, next) => {
  res.setHeader("Vary", "X-Impersonate-Role");
  next();
});

app.use("/api", router);

export default app;
