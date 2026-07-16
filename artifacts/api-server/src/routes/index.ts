import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import executeRouter from "./execute";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(executeRouter);

export default router;
