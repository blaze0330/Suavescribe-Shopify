import 'isomorphic-fetch';
import DefaultClient, { gql } from 'apollo-boost';

export function SUBSCRIPTION_DRAFT_COMMIT() {
  return gql`
    mutation subscriptionDraftCommit($draftId: ID!) {
      subscriptionDraftCommit(draftId: $draftId) {
        contract {
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

export const commitSubscriptionDraft = async (
  client: DefaultClient<unknown>,
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
      return response.data.subscriptionDraftCommit.contract.id;
    });

  return subscriptionDraftCommit;
};