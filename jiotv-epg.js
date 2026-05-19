const axios = require("axios");
const fs = require("fs");

const CHANNEL_URL =
  "https://jiotv.data.cdn.jio.com/apis/v3.0/getMobileChannelList/get/?os=android&devicetype=phone&usertype=tvYR7NSNn7rymo3F";

const EPG_URL =
  "https://jiotv.data.cdn.jio.com/apis/v1.3/getepg/get/?offset=%OFFSET%&channel_id=%CHANNEL_ID%";

const HEADERS = {
  "User-Agent":
    "okhttp/4.9.0",
  "Accept": "application/json",
  "Accept-Encoding": "gzip",
  "Connection": "keep-alive",
  "Origin": "https://www.jiotv.com",
  "Referer": "https://www.jiotv.com/",
  "Cache-Control": "no-cache",
  "Pragma": "no-cache"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await axios.get(url, {
        headers: HEADERS,
        timeout: 12000,
        validateStatus: () => true
      });

      if (res.status === 404) {
        return null;
      }

      if (res.status >= 200 && res.status < 300) {
        return res.data;
      }

      if (i === retries - 1) {
        throw new Error(`HTTP ${res.status}`);
      }

      await sleep(1000 * (i + 1));
    } catch (err) {
      if (i === retries - 1) throw err;
      await sleep(1000 * (i + 1));
    }
  }
}

async function getChannels() {
  const data = await fetchWithRetry(CHANNEL_URL);

  if (!data) {
    throw new Error("Failed to fetch channels");
  }

  if (Array.isArray(data)) return data;
  if (Array.isArray(data.result)) return data.result;
  if (Array.isArray(data.channels)) return data.channels;

  throw new Error("Could not locate channels array");
}

async function getChannelEPG(channelId, offset = 0) {
  const url = EPG_URL
    .replace("%OFFSET%", offset)
    .replace("%CHANNEL_ID%", channelId);

  return await fetchWithRetry(url);
}

async function main() {
  const channels = await getChannels();

  console.log(`Found ${channels.length} channels`);

  const output = [];

  // Lower concurrency helps avoid rate limiting
  const concurrency = 2;

  for (let i = 0; i < channels.length; i += concurrency) {
    const batch = channels.slice(i, i + concurrency);

    const batchResults = await Promise.all(
      batch.map(async (channel) => {
        const channelId =
          channel.channel_id ||
          channel.id;

        const channelName =
          channel.channel_name ||
          channel.name ||
          `channel-${channelId}`;

        if (!channelId) return null;

        try {
          const epg = await getChannelEPG(channelId, 0);

          if (!epg) {
            console.log(`No EPG: ${channelName}`);
            return null;
          }

          console.log(`Fetched EPG: ${channelName}`);

          return {
            channel_id: channelId,
            channel_name: channelName,
            epg
          };
        } catch (err) {
          console.log(`Failed: ${channelName} (${err.message})`);
          return null;
        }
      })
    );

    output.push(...batchResults.filter(Boolean));

    await sleep(1500);
  }

  fs.writeFileSync(
    "jiotv_epg_all.json",
    JSON.stringify(output, null, 2)
  );

  console.log(`Saved ${output.length} channels with EPG`);
  console.log("Output file: jiotv_epg_all.json");
}

main().catch((err) => {
  console.error("Fatal error:", err.message);
});