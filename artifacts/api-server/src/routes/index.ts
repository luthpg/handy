import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import executeRouter from "./execute";
import typescriptRouter from "./typescript";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(executeRouter);
router.use(typescriptRouter);

export default router;
