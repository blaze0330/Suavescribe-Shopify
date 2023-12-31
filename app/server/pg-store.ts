import { Session } from '@shopify/shopify-api/dist/auth/session';
import { Client, QueryResult } from 'pg';
import 'isomorphic-fetch';
import dotenv from 'dotenv';
import {
  createClient,
  getSubscriptionContract,
  getSubscriptionContracts,
  updateSubscriptionContract,
  updateSubscriptionDraft,
  commitSubscriptionDraft,
  updatePaymentMethod,
} from './handlers';
import { ApolloClient } from '@apollo/client';
import {
  generateNextBillingDate,
  generateNewBillingDate,
  sendMailGunPaymentFailure,
} from './utils';
import logger from './logger';
dotenv.config();

class PgStore {
  private client: Client;

  constructor() {
    // Create a new pg client
    // if local
    if (process.env.DOCKER === 'true') {
      // if docker
      this.client = new Client(
        `postgres://${process.env.PG_USER}:${process.env.PG_PASSWORD}@postgres:5432/${process.env.PG_DB}`
      );
    } else {
      this.client = new Client({
        user: process.env.PG_USER,
        host: process.env.PG_HOST,
        database: process.env.PG_DB,
        password: process.env.PG_PASSWORD,
        port: Number(process.env.PG_PORT) || 5432,
      });
    }
    this.client.connect();
  }

  /* 
    This loads all Active Shops
  */
  loadActiveShops = async () => {
    const query = `
      SELECT * FROM active_shops;  
    `;

    interface Shops {
      [key: string]: {
        shop: string;
        scope: string;
        accessToken: string;
      };
    }

    try {
      const reply = await this.client.query(query);
      const shops: Shops = {};
      reply.rows.forEach(row => {
        shops[row.id] = {
          shop: row.id,
          scope: row.scope,
          accessToken: row.access_token,
        };
      });
      return shops;
    } catch (err: any) {
      logger.log('error', err.message);
      throw new Error(err);
    }
  };

  /* 
    This takes in the Store Name and loads the stored Token and Scopes from the database.
  */
  loadCurrentShop = async (name: string) => {
    const query = `
      SELECT * FROM active_shops WHERE id = '${name}';  
    `;
    try {
      const res = await this.client.query(query);
      if (res.rowCount) {
        return {
          shop: res.rows[0].id,
          scope: res.rows[0].scope,
          accessToken: res.rows[0].access_token,
        };
      } else {
        return undefined;
      }
    } catch (err: any) {
      logger.log('error', new Error(err));
      throw new Error(err);
    }
  };

  /*
   This removes a store from Active Shops.
  */
  deleteActiveShop = async (name: string) => {
    logger.log('info', `Deleting active shop: ${name}`);
    const query = `
      DELETE FROM active_shops WHERE id = '${name}';
    `;
    try {
      const res = await this.client.query(query);
      if (res) {
        return true;
      } else {
        return false;
      }
    } catch (err: any) {
      logger.log('error', err.message);
      throw new Error(err);
    }
  };

  /*
    This stores a new Shop to the database.
  */
  storeActiveShop = async (data: {
    shop: string;
    scope: string;
    accessToken: string;
  }) => {
    const { shop, scope, accessToken } = data;
    const query = `
      INSERT INTO active_shops (id, scope, access_token) VALUES ('${shop}', '${scope}', '${accessToken}') RETURNING *;
    `;
    const updateQuery = `
      UPDATE active_shops SET access_token = '${accessToken}' WHERE id = '${shop} RETURNING *';
    `;
    try {
      const exists = await this.client.query(
        `SELECT * FROM active_shops WHERE id = '${shop}';`
      );

      if (exists.rowCount > 0) {
        const res = await this.client.query(updateQuery);
        if (res.rows[0]) {
          return res.rows[0];
        } else {
          return false;
        }
      } else {
        const res = await this.client.query(query);
        if (res.rows[0]) {
          return res.rows[0];
        } else {
          return false;
        }
      }
    } catch (err: any) {
      logger.log('error', err.message);
      throw new Error(err);
    }
  };

  /*
    The storeCallback takes in the Session, and saves a stringified version of it.
    This callback is used for BOTH saving new Sessions and updating existing Sessions.
    If the session can be stored, return true
    Otherwise, return false
  */
  storeCallback = async (session: Session) => {
    const query = `
      INSERT INTO sessions (id, session) VALUES ('${
        session.id
      }', '${JSON.stringify(session)}' ) RETURNING *
    `;
    const updateQuery = `
      UPDATE sessions SET session = '${JSON.stringify(session)}' WHERE id = '${
      session.id
    }' RETURNING *;
    `;
    try {
      const exists = await this.client.query(
        `SELECT * FROM sessions WHERE id = '${session.id}';`
      );

      if (exists.rowCount > 0) {
        const res = await this.client.query(updateQuery);
        if (res.rows[0]) {
          return res.rows[0];
        } else {
          return false;
        }
      } else {
        const res = await this.client.query(query);
        if (res.rows[0]) {
          return res.rows[0];
        } else {
          return false;
        }
      }
    } catch (err: any) {
      // throw errors, and handle them gracefully in your application
      logger.log('error', err.message);
      throw new Error(err);
    }
  };

  /*
    The loadCallback takes in the id, and accesses the session data
     If a stored session exists, it's parsed and returned
     Otherwise, return undefined
  */
  loadCallback = async (id: string) => {
    const query = `
      SELECT * FROM sessions WHERE id = '${id}';
    `;
    try {
      const res = await this.client.query(query);
      if (res.rowCount > 0) {
        const json = res.rows[0].session;
        const newSession = new Session(json.id);
        const keys = Object.keys(json);
        keys.forEach(key => {
          newSession[key] = json[key];
        });
        newSession.expires = json.expires ? new Date(json.expires) : new Date();
        return newSession;
      } else {
        logger.log('info', `No session found!`);
        return undefined;
      }
    } catch (err: any) {
      logger.log('error', err.message);
      throw new Error(err);
    }
  };

  /*
    The deleteCallback takes in the id, and deletes it from the database
    If the session can be deleted, return true
    Otherwise, return false
  */
  deleteCallback = async (id: string) => {
    const query = `
      DELETE FROM sessions WHERE id = '${id}';
    `;
    try {
      const res = await this.client.query(query);
      if (res) {
        return true;
      } else {
        return false;
      }
    } catch (err: any) {
      logger.log('error', err.message);
      throw new Error(err);
    }
  };

  // Local Contract Helpers
  // get local contract by id
  getLocalContract = async (id: string) => {
    const contract = await this.client.query(
      `SELECT * FROM subscription_contracts WHERE id = '${id}';`
    );
    return contract;
  };
  // create local contract
  createLocalContract = async (shop: string, contract: any) => {
    try {
      logger.log('info', `Creating Local Contract: ${contract.id}`);
      // get interval and interval count
      const interval = contract.billingPolicy.interval;
      const intervalCount = contract.billingPolicy.intervalCount;
      const query = `
        INSERT INTO subscription_contracts (id, shop, status, next_billing_date, interval, interval_count, contract) VALUES ('${
          contract.id
        }', '${shop}', '${contract.status}', '${
        contract.nextBillingDate
      }', '${interval}', '${intervalCount}', '${JSON.stringify(
        contract
      )}') RETURNING *;
      `;
      return await this.client.query(query);
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };
  // udpate local contract
  updateLocalContract = async (shop: string, contract: any) => {
    try {
      logger.log('info', `Updating Local Contract: ${contract.id}`);
      // get interval and interval count
      const interval = contract.billingPolicy.interval;
      const intervalCount = contract.billingPolicy.intervalCount;
      const query = `
        UPDATE subscription_contracts SET status = '${
          contract.status
        }', next_billing_date = '${
        contract.nextBillingDate
      }', interval = '${interval}', interval_count = '${intervalCount}', contract = '${JSON.stringify(
        contract
      )}' WHERE shop = '${shop}' AND id = '${contract.id}' RETURNING *;
      `;
      return await this.client.query(query);
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };
  // update payment failure
  updateLocalContractPaymentFailure = async (
    shop: string,
    id: string,
    reset: boolean
  ) => {
    try {
      logger.log('info', `Updating Local Contract: ${id} - Payment Failure`);
      let query: string;
      if (reset) {
        query = `
          UPDATE subscription_contracts SET payment_failure_count = 0 WHERE shop = '${shop}' AND id = '${id}' RETURNING *;
        `;
      } else {
        query = `
          UPDATE subscription_contracts SET payment_failure_count = payment_failure_count + 1 WHERE shop = '${shop}' AND id = '${id}' RETURNING *;
        `;
      }
      return await this.client.query(query);
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  /*
    Gets all contracts with Next Billing Date of Today for a given store.
  */
  getLocalContractsByShop = async (shop: string) => {
    const today = new Date().toISOString().substring(0, 10) + 'T00:00:00Z';
    try {
      logger.log('info', `Gettting all contracts for shop: ${shop}`);
      const query = `
        SELECT * FROM subscription_contracts WHERE next_billing_date = '${today}' AND shop = '${shop}' AND status = 'ACTIVE' AND payment_failure_count < 2; 
      `;
      const res = await this.client.query(query);
      return res.rows;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  /*
    Gets all contracts with Next Billing Date of 7 days from Today for a given store.
  */
  getLocalContractsRenewingSoonByShop = async (
    shop: string,
    nextBillingDate: string
  ) => {
    try {
      logger.log('info', `Gettting all contracts for shop: ${shop}`);
      const query = `
        SELECT * FROM subscription_contracts WHERE next_billing_date = '${nextBillingDate}' AND shop = '${shop}' AND status = 'ACTIVE' AND payment_failure_count < 2; 
      `;
      const res = await this.client.query(query);
      return res.rows;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  getLocalContractsWithPaymentFailuresByShop = async (shop: string) => {
    try {
      logger.log(
        'info',
        `Gettting all contracts for shop: ${shop} with 2 or more payment failures`
      );
      const query = `
        SELECT * FROM subscription_contracts WHERE payment_failure_count >= 2 AND shop = '${shop}' AND status = 'ACTIVE'; 
      `;
      const res = await this.client.query(query);
      return res.rows;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  // Webhooks
  createContract = async (shop: string, token: string, body: any) => {
    body = JSON.parse(body);

    try {
      logger.log('info', `Creating Contract`);
      const client: ApolloClient<unknown> = createClient(shop, token);
      const contract = await getSubscriptionContract(
        client,
        body.admin_graphql_api_id
      );
      const res = await this.createLocalContract(shop, contract);
      return res ? res.rowCount > 0 : false;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  updateContract = async (shop: string, token: string, body: any) => {
    body = JSON.parse(body);
    const id = body.admin_graphql_api_id;

    try {
      logger.log('info', `Updating Contract: ${id}`);
      const exists = await this.getLocalContract(id);
      const client: ApolloClient<unknown> = createClient(shop, token);
      const contract = await getSubscriptionContract(
        client,
        body.admin_graphql_api_id
      );
      let res: any;
      if (exists.rowCount > 0) {
        const paymentFailureCount = exists.rows[0].payment_failure_count;
        const status = exists.rows[0].status;
        if (status === 'CANCELLED' && contract.status === 'ACTIVE') {
          await this.updateLocalContractPaymentFailure(shop, id, true);
        }
        res = await this.updateLocalContract(shop, contract);
      } else {
        res = await this.createLocalContract(shop, contract);
      }
      return res.rowCount > 0;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  /* 
    Updates the Next Billing Date based on the interval and interval count.
    Checks to see if the contract exists locally (it should, but just to be safe).
    The Update Contract Webhook will trigger after this and Update the local database.
  */
  updateSubscriptionContractAfterSuccess = async (
    shop: string,
    token: string,
    body: any
  ) => {
    body = JSON.parse(body);
    const id = body.admin_graphql_api_subscription_contract_id;

    try {
      logger.log('info', `Updating Next Billing Date: ${id}`);
      // create apollo client
      const client: ApolloClient<unknown> = createClient(shop, token);
      // check if contract exists
      let contract = await this.getLocalContract(id);
      // if it doesnt get it from Shopify and insert into database
      if (contract.rowCount === 0) {
        const res = await getSubscriptionContract(client, id);
        contract = (await this.createLocalContract(
          shop,
          res
        )) as QueryResult<any>;
      } else {
        logger.log('info', `Contract exits lets update it: ${id}`);
        // update paymen method failure
        await this.updateLocalContractPaymentFailure(shop, id, true);
      }
      // interval
      const interval = contract.rows[0].interval;
      const intervalCount = contract.rows[0].interval_count;
      // generate next billing date
      const nextBillingDate = generateNextBillingDate(interval, intervalCount);
      logger.log(
        'info',
        `Interval -> ${interval} Count -> ${intervalCount} Next Billing Date -> ${nextBillingDate}`
      );
      // update next billing date on shopify get results use results to update local db.
      // get draft id
      const draftId = await updateSubscriptionContract(client, id);
      logger.log('info', `Draft Id: ${draftId}`);
      // create input & update draft
      const input = {
        nextBillingDate: nextBillingDate,
      };
      const updatedDraftId = await updateSubscriptionDraft(
        client,
        draftId,
        input
      );
      logger.log('info', `Updated Draft Id: ${updatedDraftId}`);
      // commit changes to draft
      const contractId = await commitSubscriptionDraft(client, updatedDraftId);
      logger.log('info', `Contract Id: ${contractId}`);
      return contractId;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  /* 
    Updates the Next Billing Date after a payment failure.
    Checks to see if the contract exists locally (it should, but just to be safe).
    The Update Contract Webhook will trigger after this and Update the local database.
  */
  updateSubscriptionContractAfterFailure = async (
    shop: string,
    token: string,
    body: any,
    updatePayment: boolean
  ) => {
    body = JSON.parse(body);
    const id = body.admin_graphql_api_subscription_contract_id;

    try {
      logger.log('info', `Updating Next Billing Date: ${id}`);
      // create apollo client
      const client: ApolloClient<unknown> = createClient(shop, token);
      // check if contract exists
      let contract = await this.getLocalContract(id);
      // if it doesnt get it from Shopify and insert into database
      if (contract.rowCount === 0) {
        const res = await getSubscriptionContract(client, id);
        contract = (await this.createLocalContract(
          shop,
          res
        )) as QueryResult<any>;
      } else {
        logger.log('info', `Contract exits lets update it: ${id}`);
        // update paymen method failure
        await this.updateLocalContractPaymentFailure(shop, id, false);
        if (updatePayment) {
          await this.updatePaymentMethod(shop, token, body);
        }
      }
      // generate next billing date
      const nextBillingDate = generateNewBillingDate();
      logger.log('info', `Next Billing Date -> ${nextBillingDate}`);
      // update next billing date on shopify get results use results to update local db.
      // get draft id
      const draftId = await updateSubscriptionContract(client, id);
      logger.log('info', `Draft Id: ${draftId}`);
      // create input & update draft
      const input = {
        nextBillingDate: nextBillingDate,
      };
      const updatedDraftId = await updateSubscriptionDraft(
        client,
        draftId,
        input
      );
      logger.log('info', `Updated Draft Id: ${updatedDraftId}`);
      // commit changes to draft
      const subscriptionContract = await commitSubscriptionDraft(
        client,
        updatedDraftId
      );
      logger.log('info', `Contract Id: ${subscriptionContract.id}`);
      // send email notification
      const email = subscriptionContract.customer.email;
      const firstName = subscriptionContract.customer.firstName;
      await sendMailGunPaymentFailure(shop, email, firstName, nextBillingDate);

      return subscriptionContract.id;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  updatePaymentMethod = async (shop: string, token: string, body: any) => {
    body = JSON.parse(body);
    const id = body.admin_graphql_api_subscription_contract_id;
    try {
      // create apollo client
      const client: ApolloClient<unknown> = createClient(shop, token);
      const res = await getSubscriptionContract(client, id);
      const paymentMethodId = res.customerPaymentMethod.id;
      const customerId = await updatePaymentMethod(client, paymentMethodId);
      return customerId;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  /*
    Get and save all contracts.
  */
  saveAllContracts = async (shop: string, token: string) => {
    try {
      logger.log('info', `Saving all contracts.`);
      // create apollo client
      const client: ApolloClient<unknown> = createClient(shop, token);
      const moveAlong = async (after?: string) => {
        const variables: {
          first: number;
          after?: string;
        } = {
          first: 3,
        };
        if (after) {
          variables.after = after;
        }
        // get
        const res = await getSubscriptionContracts(client, variables);
        // save
        let cursor: string = '';
        for (let i = 0; i < res.edges.length; i++) {
          const contract = res.edges[i];
          const exists = await this.getLocalContract(contract.node.id);
          if (exists.rowCount > 0) {
            await this.updateLocalContract(shop, contract.node);
          } else {
            await this.createLocalContract(shop, contract.node);
          }
          cursor = contract.cursor;
        }
        if (res.pageInfo.hasNextPage) {
          moveAlong(cursor);
        }
      };
      moveAlong();
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };

  /*
    Get all payment failures 
  */
  getAllPaymentFailures = async (shop: string) => {
    try {
      const query = `
        SELECT contract FROM subscription_contracts WHERE shop = '${shop}' AND (contract ->> 'status') = 'ACTIVE' AND (contract ->> 'lastPaymentStatus') <> 'SUCCEEDED'; 
      `;
      const res = await this.client.query(query);
      return res.rows;
    } catch (err: any) {
      logger.log('error', err.message);
    }
  };
}

export default PgStore;
