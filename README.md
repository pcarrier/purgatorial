# purgatorial

Remove Discord messages in select channels after a timeout. Fails fast, to be restarted. Handles downtime.

## Usage

- Create a Discord app with `SCOPES` `bot`, `PERMISSIONS` `Manage Messages`. In the `Bot` tab, get a token for it.

- Install the contents of this repo into `/usr/local/share/purgatorial` (or tweak `purgatorial.service`), where `.env` contains:

```
TOKEN=CENSORED.CENSORED.CENSORED
CHANNEL_IDS=1234,5678
MSG_TIMEOUT=3600
```

- Share the install link from the `Installation` tab with your servers' admins.

- Start running with `doas useradd -rms /usr/bin/nologin purgatorial && doas ln -sf $PWD/purgatorial.service /etc/systemd/system/ && doas systemctl enable --now purgatorial`
