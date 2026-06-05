import type { CrmProvider, CrmSyncTrigger } from "@prisma/client";
import { getModuleLogger } from "../../utils/logger";

const log = getModuleLogger("crm-sync-queue");

type CrmSyncJob = {
  companyId: string;
  leadId: string;
  provider?: CrmProvider;
  trigger: CrmSyncTrigger;
  attempt?: number;
  logId?: string;
};

type NormalizedCrmSyncJob = {
  companyId: string;
  leadId: string;
  provider?: CrmProvider;
  trigger: CrmSyncTrigger;
  attempt: number;
  logId?: string;
  runAfter: number;
};

type Processor = (job: NormalizedCrmSyncJob) => Promise<void>;

export const CRM_SYNC_MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [0, 5000, 15000];
const MAX_CONCURRENCY = 3;
const MIN_DELAY_BETWEEN_JOBS_MS = 400;

let processor: Processor | null = null;
const jobs: NormalizedCrmSyncJob[] = [];
let activeJobs = 0;
let lastJobStartAt = 0;
let queueTimer: NodeJS.Timeout | null = null;

function normalizeJob(job: CrmSyncJob): NormalizedCrmSyncJob {
  return {
    companyId: job.companyId,
    leadId: job.leadId,
    provider: job.provider,
    trigger: job.trigger,
    attempt: job.attempt ?? 1,
    logId: job.logId,
    runAfter: Date.now(),
  };
}

export const crmSyncQueue = {
  setProcessor(nextProcessor: Processor) {
    processor = nextProcessor;
  },

  enqueue(job: CrmSyncJob) {
    const normalized = normalizeJob(job);
    jobs.push(normalized);
    this.kick();
  },

  async process(job: NormalizedCrmSyncJob) {
    if (!processor) {
      log.warn("CRM sync queue processor is not registered");
      return;
    }

    try {
      await processor(job);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`CRM sync job failed for lead ${job.leadId}: ${message}`);

      if (job.attempt < CRM_SYNC_MAX_ATTEMPTS) {
        const retryDelayMs = getRetryDelayMs(job.attempt + 1, error);
        jobs.push({
          ...job,
          attempt: job.attempt + 1,
          runAfter: Date.now() + retryDelayMs,
        });
        this.kick();
      }
    }
  },

  kick() {
    if (queueTimer) {
      return;
    }
    queueTimer = setTimeout(() => {
      queueTimer = null;
      this.pump();
    }, 0);
  },

  pump() {
    if (!processor || activeJobs >= MAX_CONCURRENCY) {
      return;
    }

    const now = Date.now();
    const earliestRunnableIndex = jobs.findIndex((job) => job.runAfter <= now);
    if (earliestRunnableIndex === -1) {
      const nextRunAt = jobs.reduce((min, job) => Math.min(min, job.runAfter), Number.POSITIVE_INFINITY);
      if (Number.isFinite(nextRunAt)) {
        const waitMs = Math.max(nextRunAt - now, 0);
        queueTimer = setTimeout(() => {
          queueTimer = null;
          this.pump();
        }, waitMs);
      }
      return;
    }

    const waitForSpacing = Math.max(MIN_DELAY_BETWEEN_JOBS_MS - (now - lastJobStartAt), 0);
    if (waitForSpacing > 0) {
      queueTimer = setTimeout(() => {
        queueTimer = null;
        this.pump();
      }, waitForSpacing);
      return;
    }

    const [nextJob] = jobs.splice(earliestRunnableIndex, 1);
    activeJobs += 1;
    lastJobStartAt = Date.now();

    void this.process(nextJob)
      .finally(() => {
        activeJobs = Math.max(activeJobs - 1, 0);
        this.kick();
      });

    if (activeJobs < MAX_CONCURRENCY && jobs.length > 0) {
      this.kick();
    }
  },
};

function getRetryDelayMs(attempt: number, error?: unknown) {
  const baseDelay = RETRY_DELAYS_MS[Math.max(attempt - 1, 0)] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
  const retryAfterMs = extractRetryAfterMs(error);
  if (!retryAfterMs) {
    return baseDelay;
  }
  return Math.max(baseDelay, retryAfterMs);
}

function extractRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const retryAfterMs = (error as { retryAfterMs?: unknown }).retryAfterMs;
  if (typeof retryAfterMs !== "number" || !Number.isFinite(retryAfterMs)) {
    return null;
  }
  return retryAfterMs > 0 ? retryAfterMs : null;
}
