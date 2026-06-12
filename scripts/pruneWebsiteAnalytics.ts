import "dotenv/config";

import { pruneWebsiteAnalytics } from "../src/lib/websiteAnalytics/retention";

async function main() {
    const result = await pruneWebsiteAnalytics();

    if (!result) {
        console.log(
            "Website analytics retention is disabled. Set WEBSITE_ANALYTICS_RETENTION_DAYS to a positive number."
        );
        return;
    }

    console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
    console.error("Failed to prune website analytics", error);
    process.exit(1);
});
