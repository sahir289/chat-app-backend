export type AnniversaryBillingPeriod = {
  subscriptionStartDate: Date;
  billingAnchorDay: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  nextBillingAt: Date;
};

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
  subscriptionStartDate: Date
): Date {
  return buildUtcAnchorDate(
    subscriptionStartDate,
    currentPeriodStart.getUTCFullYear(),
    currentPeriodStart.getUTCMonth() + 1,
    billingAnchorDay
  );
}

export function buildInitialAnniversaryBillingPeriod(
  subscriptionStartDate: Date
): AnniversaryBillingPeriod {
  const billingAnchorDay = getBillingAnchorDay(subscriptionStartDate);
  const nextBillingAt = calculateNextBillingAt(
    subscriptionStartDate,
    billingAnchorDay,
    subscriptionStartDate
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
  billingAnchorDay?: number | null;
  currentPeriodStart?: Date | null;
  nextBillingAt?: Date | null;
  now?: Date;
}): AnniversaryBillingPeriod {
  const subscriptionStartDate = params.subscriptionStartDate;
  const billingAnchorDay =
    params.billingAnchorDay ?? getBillingAnchorDay(subscriptionStartDate);
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
      subscriptionStartDate
    );

  while (nextBillingAt <= now) {
    currentPeriodStart = nextBillingAt;
    nextBillingAt = calculateNextBillingAt(
      currentPeriodStart,
      billingAnchorDay,
      subscriptionStartDate
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
