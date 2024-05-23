import {load} from "https://deno.land/std@0.224.0/dotenv/mod.ts";

const env = await load(),
  token = env["TOKEN"],
  msgTimeout = Number(env["MSG_TIMEOUT"] || "10800000"),
  channelIDs = (env["CHANNEL_IDS"] || "").split(",").map((id) => id.trim());

function error(err: Event | ErrorEvent): never {
  console.log("error", err);
  Deno.exit(1);
}

function fetchWith429Retry(url: string, init?: RequestInit): Promise<Response> {
  return new Promise((resolve, reject) => {
    fetch(url, init).then((res) => {
      if (res.status === 429) {
        setTimeout(() => {
          fetchWith429Retry(url, init).then(resolve, reject);
        }, Number(res.headers.get("retry-after")) * 1000);
      } else {
        resolve(res);
      }
    }).catch(reject);
  });
}

async function deleteMessage(channelID: string, messageID: string) {
  const res = await fetchWith429Retry(
    `https://discord.com/api/v10/channels/${channelID}/messages/${messageID}`,
    {
      method: "DELETE",
      headers: {
        "Authorization": `Bot ${token}`,
      },
    });
  if (!res.ok && res.status !== 404) {
    console.log("failed to delete message", res.status);
    Deno.exit(1);
  }
}

async function backfillChannel(channelID: string) {
  let after: string | undefined = undefined;
  while (true) {
    const res = await fetchWith429Retry(
      `https://discord.com/api/v10/channels/${channelID}/messages${
        after ? `?after=${after}` : ""
      }`,
      {
        headers: {
          "Authorization": `Bot ${token}`,
        },
      },
    );
    if (!res.ok) {
      console.log("failed to fetch messages", res.status);
      Deno.exit(1);
    }
    const messages = await res.json();
    if (messages.length === 0) {
      return;
    }
    for (const message of messages) {
      const date = new Date(message.timestamp);
      if (Date.now() - date.getTime() > msgTimeout) {
        await deleteMessage(channelID, message.id);
      } else {
        setTimeout(() => {
          deleteMessage(channelID, message.id);
        }, date.getTime() + msgTimeout - Date.now());
      }
    }
    after = messages[0].id;
  }
}

function connect(): WebSocket {
  let d: number | null = null;
  const ws = new WebSocket("wss://gateway.discord.gg/");
  ws.onmessage = async (msg) => {
    const payload = JSON.parse(msg.data);
    d = payload.s || d;
    switch (payload.op) {
      case 10:
        setInterval(() => {
          ws.send(JSON.stringify({ op: 1, d }));
        }, payload.d.heartbeat_interval);
        ws.send(JSON.stringify({
          op: 2,
          d: {
            token,
            intents: 1 << 9,
            properties: {
              os: "deno",
              browser: "deno",
              device: "deno",
            },
          },
        }));
        break;
      case 0:
        switch (payload.t) {
          case "READY":
            for (const channelID of channelIDs) {
              await backfillChannel(channelID);
            }
            break;
          case "MESSAGE_CREATE": {
            const channelID = payload.d.channel_id;
            if (channelIDs.includes(channelID)) {
              const msgID = payload.d.id;
              setTimeout(() => deleteMessage(channelID, msgID), msgTimeout);
            }
            break;
          }
        }
    }
  };
  ws.onclose = (e) => {
    console.log("oops!", e.reason);
    Deno.exit(1);
  };
  ws.onerror = (err) => error(err);
  return ws;
}

connect();
