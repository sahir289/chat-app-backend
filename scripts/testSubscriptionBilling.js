const assert = require("node:assert/strict");

const {
  buildInitialAnniversaryBillingPeriod,
  buildActiveAnniversaryBillingPeriod,
} = require("../dist/src/utils/billingPeriod.js");

function testApril21Cycle() {
  const start = new Date("2026-04-21T00:00:00.000Z");
  const cycle = buildInitialAnniversaryBillingPeriod(start);

  assert.equal(cycle.billingAnchorDay, 21);
  assert.equal(cycle.currentPeriodStart.toISOString(), "2026-04-21T00:00:00.000Z");
  assert.equal(cycle.nextBillingAt.toISOString(), "2026-05-21T00:00:00.000Z");
  assert.equal(cycle.currentPeriodEnd.toISOString(), "2026-05-20T23:59:59.999Z");
}

function testJanuary31Clamp() {
  const start = new Date("2026-01-31T00:00:00.000Z");
  const initial = buildInitialAnniversaryBillingPeriod(start);
  const renewed = buildActiveAnniversaryBillingPeriod({
    subscriptionStartDate: start,
    billingAnchorDay: initial.billingAnchorDay,
    currentPeriodStart: initial.nextBillingAt,
    now: new Date("2026-02-28T00:00:00.000Z"),
  });

  assert.equal(initial.nextBillingAt.toISOString(), "2026-02-28T00:00:00.000Z");
  assert.equal(initial.currentPeriodEnd.toISOString(), "2026-02-27T23:59:59.999Z");
  assert.equal(renewed.nextBillingAt.toISOString(), "2026-03-31T00:00:00.000Z");
  assert.equal(renewed.currentPeriodEnd.toISOString(), "2026-03-30T23:59:59.999Z");
}

testApril21Cycle();
testJanuary31Clamp();

console.log("Subscription billing tests passed.");
