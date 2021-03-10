import 'isomorphic-fetch';
import { gql } from 'apollo-boost';
import { Context } from 'koa';

export function SELLING_PLAN_ADD_PRODUCT_VARIANT() {
  return gql`
    mutation productVariantJoinSellingPlanGroups(
      $id: ID!
      $sellingPlanGroupIds: [ID!]!
    ) {
      productVariantJoinSellingPlanGroups(
        id: $id
        sellingPlanGroupIds: $sellingPlanGroupIds
      ) {
        productVariant {
          id
        }
        userErrors {
          code
          field
          message
        }
      }
    }
  `;
}

export const addProductVariantToSellingPlanGroups = async (ctx: Context) => {
  const { client } = ctx;
  const body = JSON.parse(ctx.request.body);
  const { variantId, selectedPlans } = body;
  const variables = {
    id: variantId,
    sellingPlanGroupIds: selectedPlans,
  };
  const productVariant = await client
    .mutate({
      mutation: SELLING_PLAN_ADD_PRODUCT_VARIANT(),
      variables: variables,
    })
    .then((response: { data: any }) => {
      return response.data;
    });

  return productVariant;
};
