import { Session } from '@shopify/shopify-api/dist/auth/session';
import { Client } from 'pg';
import 'isomorphic-fetch';
import dotenv from 'dotenv';
import {
  createClient,
  getSubscriptionContract,
  getSubscriptionContracts,
  updateSubscriptionContract,
  updateSubscriptionDraft,
  commitSubscriptionDraft,
} from './handlers';
import DefaultClient from 'apollo-boost';
import { generateNextBillingDate } from './utils';
dotenv.config();

class PgStore {
  private client: Client;

  constructor() {
    // Create a new pg client
    // this.client = new Client({
    //   user: process.env.PG_USER,
    //   host: process.env.PG_HOST,
    //   database: process.env.PG_DB,
    //   password: process.env.PG_PASSWORD,
    //   port: Number(process.env.PG_PORT) || 5432,
    // });
    this.client = new Client(
      `postgres://${process.env.PG_USER}:${process.env.PG_PASSWORD}@postgres:5432/${process.env.PG_DB}`
    );
    this.client.connect();
  }

  /* 
    This loads all Active Shops
  */
  loadActiveShops = async () => {
    console.log('LOADING ACTIVE SHOPS');
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
    } catch (err) {
      throw new Error(err);
    }
  };

  /* 
    This takes in the Store Name and loads the stored Token and Scopes from the database.
  */
  loadCurrentShop = async (name: string) => {
    console.log('LOADING ACTIVE SHOP', name);
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
    } catch (err) {
      throw new Error(err);
    }
  };

  /*
   This removes a store from Active Shops.
  */
  deleteActiveShop = async (name: string) => {
    console.log('DELETING ACTIVE SHOP', name);
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
    } catch (err) {
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
    console.log('STORING ACTIVE SHOP', shop);
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
    } catch (err) {
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
    console.log('STORING SESSION', session.id);
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

      console.log('EXISTS', exists);

      if (exists.rowCount > 0) {
        console.log('UPDATING ===>', session.id);
        const res = await this.client.query(updateQuery);
        if (res.rows[0]) {
          return res.rows[0];
        } else {
          return false;
        }
      } else {
        console.log('CREATING ===>', session.id);
        const res = await this.client.query(query);
        if (res.rows[0]) {
          return res.rows[0];
        } else {
          return false;
        }
      }
    } catch (err) {
      // throw errors, and handle them gracefully in your application
      throw new Error(err);
    }
  };

  /*
    The loadCallback takes in the id, and accesses the session data
     If a stored session exists, it's parsed and returned
     Otherwise, return undefined
  */
  loadCallback = async (id: string) => {
    console.log('LOADING SESSION', id);
    const query = `
      SELECT * FROM sessions WHERE id = '${id}';
    `;
    try {
      const res = await this.client.query(query);
      console.log('RESULT', res.rowCount);
      if (res.rowCount > 0) {
        console.log('SESSION FOUND');
        const json = res.rows[0].session;
        const newSession = new Session(json.id);
        const keys = Object.keys(json);
        keys.forEach(key => {
          newSession[key] = json[key];
        });
        newSession.expires = json.expires ? new Date(json.expires) : new Date();
        return newSession;
      } else {
        console.log('NO SESSION FOUND');
        return undefined;
      }
    } catch (err) {
      throw new Error(err);
    }
  };

  /*
    The deleteCallback takes in the id, and deletes it from the database
    If the session can be deleted, return true
    Otherwise, return false
  */
  deleteCallback = async (id: string) => {
    console.log('DELETING', id);
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
    } catch (err) {
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
  };
  // udpate local contract
  updateLocalContract = async (shop: string, contract: any) => {
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
    )}' WHERE id = '${contract.id}' RETURNING *;
      `;
    return await this.client.query(query);
  };

  /*
    Gets all contracts with Next Billing Date of Today for a given store.
  */
  getLocalContractsByShop = async (shop: string) => {
    console.log('GETTING ALL CONTRACTS FOR SHOP:', shop);
    const today = new Date().toISOString().substring(0, 10) + 'T00:00:00Z';
    // testing
    // const today = '2021-03-25T00:00:00Z';
    try {
      const query = `
        SELECT * FROM subscription_contracts WHERE next_billing_date = '${today}' AND shop = '${shop}' AND status = 'ACTIVE'; 
      `;
      const res = await this.client.query(query);
      console.log('RESPONSE', res.rows);
      return res.rows;
    } catch (err) {
      console.log('ERROR GETTING CONTRACTS', err);
    }
  };

  // Webhooks
  createContract = async (shop: string, token: string, body: any) => {
    console.log('CREATING CONTRACT');
    body = JSON.parse(body);

    try {
      const client: DefaultClient<unknown> = createClient(shop, token);
      const contract = await getSubscriptionContract(
        client,
        body.admin_graphql_api_id
      );
      const res = await this.createLocalContract(shop, contract);
      return res.rowCount > 0;
    } catch (err) {
      console.log('Error Saving Contract', err);
    }
  };

  updateContract = async (shop: string, token: string, body: any) => {
    body = JSON.parse(body);
    const id = body.admin_graphql_api_id;

    try {
      const exists = await this.getLocalContract(id);
      console.log('Exists', exists);
      const client: DefaultClient<unknown> = createClient(shop, token);
      const contract = await getSubscriptionContract(
        client,
        body.admin_graphql_api_id
      );
      console.log('CONTRACT FROM SHOPIFY', JSON.stringify(contract));
      let res: any;
      if (exists.rowCount > 0) {
        res = await this.updateLocalContract(shop, contract);
      } else {
        res = await this.createLocalContract(shop, contract);
      }
      // const res = await this.client.query(query);
      console.log('UPDATED RESPONSE', res);
      return res.rowCount > 0;
    } catch (err) {
      console.log('Error Updating Contract', err);
    }
  };

  /* 
    Updates the Next Billing Date based on the interval and interval count.
    Checks to see if the contract exists locally (it should, but just to be safe).
    The Update Contract Webhook will trigger after this and UPdate the local database.
  */
  updateNextBillingDate = async (shop: string, token: string, body: any) => {
    body = JSON.parse(body);
    const id = body.admin_graphql_api_subscription_contract_id;

    try {
      // create apollo client
      const client: DefaultClient<unknown> = createClient(shop, token);
      // check if contract exists
      let contract = await this.getLocalContract(id);
      // if it doesnt get it from Shopify and insert into database
      if (contract.rowCount === 0) {
        console.log('CONTRACT DOESNT EXIST LETS GRAB IT AND SAVE IT');
        const res = await getSubscriptionContract(client, id);
        contract = await this.createLocalContract(shop, res);
      } else {
        console.log('CONTRACT EXISTS LETS JUST UPDATE IT');
      }
      // interval
      const interval = contract.rows[0].interval;
      const intervalCount = contract.rows[0].interval_count;
      // generate next billing date
      const nextBillingDate = generateNextBillingDate(interval, intervalCount);
      console.log(
        `Interval -> ${interval} Count -> ${intervalCount} Next Billing Date -> ${nextBillingDate}`
      );
      // update next billing date on shopify get results use results to update local db.
      // get draft id
      const draftId = await updateSubscriptionContract(client, id);
      console.log('Draft Id', draftId);
      // create input & update draft
      const input = {
        nextBillingDate: nextBillingDate,
      };
      const updatedDraftId = await updateSubscriptionDraft(
        client,
        draftId,
        input
      );
      console.log('Updated Draft Id', updatedDraftId);
      // commit changes to draft
      const contractId = await commitSubscriptionDraft(client, updatedDraftId);
      console.log('Contract ID', contractId);
      return contractId;
    } catch (err) {
      console.log('Error Updating Contract', err);
    }
  };

  /*
    Get and save all contracts.
  */
  saveAllContracts = async (shop: string, token: string) => {
    try {
      console.log('SAVING ALL CONTRACTS');
      // create apollo client
      const client: DefaultClient<unknown> = createClient(shop, token);
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
    } catch (err) {
      console.log('Error Getting Contracts');
    }
  };
}

export default PgStore;