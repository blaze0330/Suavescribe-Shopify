export interface SellingPlanGroup {
  id: string;
  appId: string;
  description: string;
  options: string[];
  name: string;
  merchantCode: string;
  summary: string;
  sellingPlans: {
    edges: SellingPlan[];
  };
}

export interface SellingPlan {
  node: {
    id: string;
    name: string;
    description: string;
    options: string[];
    position: number;
    billingPolicy: {
      interval: string;
      intervalCount: number;
    };
    deliveryPolicy: {
      interval: string;
      intervalCount: number;
    };
    pricingPolicies: [
      {
        adjustmentType: string;
        adjustmentValue: {
          percentage: number;
        };
      }
    ];
  };
}
