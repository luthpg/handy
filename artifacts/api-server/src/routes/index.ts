import { Router, type IRouter } from "express";
import healthRouter from "./health";
import filesRouter from "./files";
import executeRouter from "./execute";
import typescriptRouter from "./typescript";
import gitRouter from "./git";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(filesRouter);
router.use(executeRouter);
router.use(typescriptRouter);
router.use(gitRouter);
router.use(authRouter);

export default router;
