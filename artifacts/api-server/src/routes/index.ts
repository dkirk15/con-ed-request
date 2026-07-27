import { Router, type IRouter } from "express";
import healthRouter from "./health";
import usersRouter from "./users";
import clinicsRouter from "./clinics";
import requestsRouter from "./requests";
import dashboardRouter from "./dashboard";
import storageRouter from "./storage";
import reportsRouter from "./reports";
import tasksRouter from "./tasks";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(usersRouter);
router.use(clinicsRouter);
router.use(requestsRouter);
router.use(dashboardRouter);
router.use(reportsRouter);
router.use(tasksRouter);
router.use(settingsRouter);
router.use(storageRouter);

export default router;
