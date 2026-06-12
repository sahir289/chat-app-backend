export type AnniversaryBillingPeriod = {
  subscriptionStartDate: Date;
  billingAnchorDay: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt: Date;
};

export type SubscriptionBillingCycle =
  | "TRIAL"
  | "TEST_1_MIN"
  | "MONTHLY"
  | "QUARTERLY"
  | "HALF_YEARLY"
  | "YEARLY";

function isFixedDurationBillingCycle(billingCycle: SubscriptionBillingCycle): boolean {
  return billingCycle === "TRIAL" || billingCycle === "TEST_1_MIN";
}

export { isFixedDurationBillingCycle };

function getLastDayOfMonthUtc(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function buildUtcAnchorDate(
  template: Date,
  year: number,
  monthIndex: number,
  billingAnchorDay: number
): Date {
  const day = Math.min(billingAnchorDay, getLastDayOfMonthUtc(year, monthIndex));
  return new Date(
    Date.UTC(
      year,
      monthIndex,
      day,
      template.getUTCHours(),
      template.getUTCMinutes(),
      template.getUTCSeconds(),
      template.getUTCMilliseconds()
    )
  );
}

export function getBillingAnchorDay(subscriptionStartDate: Date): number {
  return subscriptionStartDate.getUTCDate();
}

export function calculateNextBillingAt(
  currentPeriodStart: Date,
  billingAnchorDay: number,
  subscriptionStartDate: Date,
  billingCycle: SubscriptionBillingCycle = "MONTHLY"
): Date {
  if (billingCycle === "TRIAL") {
    return new Date(currentPeriodStart.getTime() + 5 * 24 * 60 * 60 * 1000);
  }

  if (billingCycle === "TEST_1_MIN") {
    return new Date(currentPeriodStart.getTime() + 60 * 1000);
  }

  if (billingCycle === "MONTHLY") {
    return new Date(currentPeriodStart.getTime() + 30 * 24 * 60 * 60 * 1000);
  }

  const monthsToAdd = billingCycle === "QUARTERLY" ? 3 : billingCycle === "HALF_YEARLY" ? 6 : 12;
  return buildUtcAnchorDate(
    subscriptionStartDate,
    currentPeriodStart.getUTCFullYear(),
    currentPeriodStart.getUTCMonth() + monthsToAdd,
    billingAnchorDay
  );
}

export function buildInitialAnniversaryBillingPeriod(
  subscriptionStartDate: Date,
  billingCycle: SubscriptionBillingCycle = "MONTHLY"
): AnniversaryBillingPeriod {
  const billingAnchorDay = getBillingAnchorDay(subscriptionStartDate);
  const nextBillingAt = calculateNextBillingAt(
    subscriptionStartDate,
    billingAnchorDay,
    subscriptionStartDate,
    billingCycle
  );

  return {
    subscriptionStartDate,
    billingAnchorDay,
    currentPeriodStart: subscriptionStartDate,
    currentPeriodEnd: new Date(nextBillingAt.getTime() - 1),
    nextBillingAt,
  };
}

export function buildActiveAnniversaryBillingPeriod(params: {
  subscriptionStartDate: Date;
  billingCycle?: SubscriptionBillingCycle | null;
  billingAnchorDay?: number | null;
  currentPeriodStart?: Date | null;
  nextBillingAt?: Date | null;
  now?: Date;
}): AnniversaryBillingPeriod {
  const subscriptionStartDate = params.subscriptionStartDate;
  const billingAnchorDay =
    params.billingAnchorDay ?? getBillingAnchorDay(subscriptionStartDate);
  const billingCycle = params.billingCycle ?? "MONTHLY";
  const now = params.now ?? new Date();

  let currentPeriodStart =
    params.currentPeriodStart && params.currentPeriodStart >= subscriptionStartDate
      ? params.currentPeriodStart
      : subscriptionStartDate;

  let nextBillingAt =
    params.nextBillingAt ??
    calculateNextBillingAt(
      currentPeriodStart,
      billingAnchorDay,
      subscriptionStartDate,
      billingCycle
    );

  if (isFixedDurationBillingCycle(billingCycle)) {
    return {
      subscriptionStartDate,
      billingAnchorDay,
      currentPeriodStart,
      currentPeriodEnd: new Date(nextBillingAt.getTime() - 1),
      nextBillingAt,
    };
  }

  while (nextBillingAt <= now) {
    currentPeriodStart = nextBillingAt;
    nextBillingAt = calculateNextBillingAt(
      currentPeriodStart,
      billingAnchorDay,
      subscriptionStartDate,
      billingCycle
    );
  }

  return {
    subscriptionStartDate,
    billingAnchorDay,
    currentPeriodStart,
    currentPeriodEnd: new Date(nextBillingAt.getTime() - 1),
    nextBillingAt,
  };
}
