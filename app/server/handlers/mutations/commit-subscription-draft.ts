import 'isomorphic-fetch';
import { gql, ApolloClient } from '@apollo/client';

export function SUBSCRIPTION_DRAFT_COMMIT() {
  return gql`
    mutation subscriptionDraftCommit($draftId: ID!) {
      subscriptionDraftCommit(draftId: $draftId) {
        contract {
          id
          status
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

export const commitSubscriptionDraft = async (
  client: ApolloClient<unknown>,
  id: string
) => {
  const subscriptionDraftCommit = await client
    .mutate({
      mutation: SUBSCRIPTION_DRAFT_COMMIT(),
      variables: {
        draftId: id,
      },
    })
    .then((response: any) => {
      const data = response.data.subscriptionDraftCommit;
      if (data.userErrors.length > 0) {
        return data.userErrors;
      }
      return data.contract.id;
    });

  return subscriptionDraftCommit;
};
