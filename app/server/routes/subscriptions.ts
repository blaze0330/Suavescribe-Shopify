import dotenv from 'dotenv';
import Router from 'koa-router';
import { Context, Next } from 'koa';
import jwt from 'jsonwebtoken';
import {
  getAllSubscriptionGroups,
  addProductToSubscriptionPlanGroup,
  createSubscriptionPlanGroup,
  createSubscriptionPlanGroupV2,
  editSubscriptionPlanGroup,
  removeProductFromSubscriptionPlanGroup,
  deleteSubscriptionPlanGroup,
  getSubscriptionGroup,
} from '../controllers/subscriptions';

const router = new Router();
dotenv.config();

const verifyJwt = async (ctx: Context, next: Next) => {
  const token = ctx.request.headers['x-suavescribe-token'];
  if (!token) return (ctx.status = 401);
  try {
    // decode
    const decoded: any = jwt.verify(
      token as string,
      process.env.SHOPIFY_API_SECRET!,
      {
        complete: true,
      }
    );
    // set shop
    ctx.state.shop = decoded.payload.dest.replace(/https:\/\//, '');
    return await next();
  } catch (err: any) {
    console.log('Error', err.message);
    return (ctx.status = 401);
  }
};

// Extension routes
router.post('/subscription-plan/all', verifyJwt, getAllSubscriptionGroups);

router.post('/subscription-plan/get', verifyJwt, getSubscriptionGroup);

router.post(
  '/subscription-plan/product/add',
  verifyJwt,
  addProductToSubscriptionPlanGroup
);

router.post(
  '/subscription-plan/create',
  verifyJwt,
  createSubscriptionPlanGroup
);

router.post(
  '/subscription-plan/v2/create',
  verifyJwt,
  createSubscriptionPlanGroupV2
);

router.post('/subscription-plan/edit', verifyJwt, editSubscriptionPlanGroup);

router.post(
  '/subscription-plan/product/remove',
  verifyJwt,
  removeProductFromSubscriptionPlanGroup
);

router.post(
  '/subscription-plan/delete',
  verifyJwt,
  deleteSubscriptionPlanGroup
);

export default router;
