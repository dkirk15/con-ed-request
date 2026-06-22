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

app.use("/api", router);

export default app;
